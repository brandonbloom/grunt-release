/*
 * grunt-release
 * https://github.com/geddski/grunt-release
 *
 * Copyright (c) 2013 Dave Geddes
 * Licensed under the MIT license.
 */

var shell = require('shelljs');
var semver = require('semver');

module.exports = function(grunt){
  grunt.registerTask('release', 'bump version, git tag, git push, npm publish', function(type){
    
    //defaults
    var options = this.options({
      bump: true,
      file: grunt.config('pkgFile') || 'package.json',
      add: true,
      commit: true,
      tag: true,
      push: true,
      pushTags: true,
      npm : true
    });

    var config = setup(options.file, type);
    var templateOptions = {
      data: {
        version: config.newVersion
      }
    };
    var tagName = grunt.template.process(grunt.config.getRaw('release.options.tagName') || '<%= version %>', templateOptions);
    var commitMessage = grunt.template.process(grunt.config.getRaw('release.options.commitMessage') || 'release <%= version %>', templateOptions);
    var tagMessage = grunt.template.process(grunt.config.getRaw('release.options.tagMessage') || 'version <%= version %>', templateOptions);
    var nowrite = grunt.option('no-write');
    var task = this;

    var steps = [];
    if (options.bump) steps.push(bump);
    if (options.add) steps.push(add);
    if (options.commit) steps.push(commit);
    if (options.tag) steps.push(tag);
    if (options.push) steps.push(push);
    if (options.pushTags) steps.push(pushTags);
    if (options.npm) steps.push(publish);
    if (options.github) steps.push(githubRelease);

    for (var step = 0; step < steps.length; step++){
      if (!steps[step](config)) {
        break;
      }
    }

    function setup(file, type){
      var pkg = grunt.file.readJSON(file);
      var newVersion = pkg.version;
      if (options.bump) {
        newVersion = semver.inc(pkg.version, type || 'patch');
      }
      return {file: file, pkg: pkg, newVersion: newVersion};
    }

    function add(config){
      return run('git add ' + config.file);
    }

    function commit(config){
      return run('git commit '+ config.file +' -m "'+ commitMessage +'"', config.file + ' committed');
    }

    function tag(config){
      return run('git tag ' + tagName + ' -m "'+ tagMessage +'"', 'New git tag created: ' + tagName);
    }

    function push(config){
      return run('git push', 'pushed to remote');
    }

    function pushTags(config){
      return run('git push --tags', 'pushed new tag '+ config.newVersion +' to remote');
    }

    function publish(config){
      var cmd = 'npm publish';
      var msg = 'published '+ config.newVersion +' to npm';
      var npmtag = getNpmTag();
      if (npmtag){ 
        cmd += ' --tag ' + npmtag;
        msg += ' with a tag of "' + npmtag + '"';
      }
      if (options.folder){ cmd += ' ' + options.folder }
      return run(cmd, msg);
    }

    function getNpmTag(){
      var tag = grunt.option('npmtag') || options.npmtag;
      if(tag === true) { tag = config.newVersion }
      return tag;
    }

    function run(cmd, msg){
      var success;
      if (nowrite) {
        grunt.verbose.writeln('Not actually running: ' + cmd);
        success = true;
      }
      else {
        grunt.verbose.writeln('Running: ' + cmd);
        success = (shell.exec(cmd, {silent:true}).code === 0);
      }

      msg = msg || cmd;
      if (success){
        grunt.log.ok(msg);
      }
      else {
        grunt.fail.warn(msg + ' failed');
      }
      return success;
    }

    function bump(config){
      config.pkg.version = config.newVersion;
      grunt.file.write(config.file, JSON.stringify(config.pkg, null, '  ') + '\n');
      grunt.log.ok('Version bumped to ' + config.newVersion);
      return true;
    }

    function githubRelease(){
      var request = require('superagent');
      var done = task.async();

      if (nowrite){
        grunt.verbose.writeln('Not actually creating github release: ' + tagName);
        success();
      }

      request
        .post('https://api.github.com/repos/' + options.github.repo + '/releases')
        .auth(process.env[options.github.usernameVar], process.env[options.github.passwordVar])
        .set('Accept', 'application/vnd.github.manifold-preview')
        .send({"tag_name": tagName, "name": tagMessage})
        .end(function(res){
          if (res.statusCode === 201){
            success();
          } 
          else {
            grunt.fail.warn('Error creating github release. Response: ' + res.text);
          }
        });

        function success(){
          grunt.log.ok('created ' + tagName + ' release on github.');
          done();
        }
    }

  });
};
