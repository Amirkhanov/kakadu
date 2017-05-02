#!/usr/bin/env node

'use strict';

const fs           = require('fs-extra');
const gulp         = require('gulp');
const util         = require('gulp-util');
const plumber      = require('gulp-plumber');
const stylus       = require('gulp-stylus');
const less         = require('gulp-less');
const scss         = require('gulp-sass');
const basicAuth    = require('basic-auth');
const autoprefixer = require('gulp-autoprefixer');
const groupMq      = require('gulp-group-css-media-queries');
const runSequence  = require('run-sequence');
const bs           = require('browser-sync').create();
const program      = require('commander');
const jsonfile     = require('jsonfile');
const inquirer     = require('inquirer');
const chalk        = require('chalk');
const pkg          = require('../package.json');
const questions    = [
    {
        type: 'input',
        name: 'host',
        message: 'Host for proxy'
    },
    {
        type    : 'input',
        name    : 'port',
        message : 'Server port',
        default : () => {
            return '7200';
        },
        validate: (value) => {

            let check = value.match(/^\d+$/);

            if (check) {
                return true;
            }

            return 'Use only numbers';
        }
    },
    {
        type: 'list',
        name: 'tech',
        message: 'What CSS pre-processor do you need?',
        choices: ['Styl', 'Scss', 'Less'],
        filter: (val) => {
            return val.toLowerCase();
        }
    }
];

let config = {
    bs : {
        proxy          : null,
        port           : 7200,
        notify         : true,
        open           : true,
        logLevel       : 'info',
        logPrefix      : 'KAKADU',
        logFileChanges : true
    },
    autoprefixer : {
        browsers : [
            "last 2 version",
            "ie >= 9",
            "Android 2.3",
            "Android >= 4",
            "Chrome >= 20",
            "Firefox >= 24",
            "Explorer >= 8",
            "iOS >= 6",
            "Opera >= 12",
            "Safari >= 6"
        ],
        cascade: true
    }
};

let fileName = '';

program
    .version(pkg.version)
    .option('-a, --auth', 'enable basic authentication')
    .option('-u, --user [username]', 'set user')
    .option('-p, --pass [password]', 'set password')
    .parse(process.argv);

if (program.auth) {

    if (!program.user || !program.pass) {
        util.log(`You are running ${chalk.bold.yellow('kakadu')} with basic auth but did not set the USER ${chalk.bold.yellow('-u')} and PASSWORD ${chalk.bold.yellow('-p')} with cli args.`);
        process.exit(1);
    }
}

let create_config = (path, config) => {

    jsonfile.writeFile(path, config, { spaces : 2 }, (err) => {
        if (err) {
            console.error(err);
        } else {

            console.log('Configuration file created');

            fs.writeFileSync(fileName, '// hello kakadu project ' + config.bs.proxy);
            fs.writeFileSync('app.js', '// hello kakadu project ' + config.bs.proxy);

            gulp.start('start');
        }
    });
};

let stylesPreProcessor = () => {

    switch (config.tech) {

        case 'styl':
            return stylus();
        break;

        case 'scss':
            return scss();
        break;

        case 'less':
            return less();
        break;

        default:
            console.log('Styles pre-processor error, no option in config');
    }
}

gulp.task('styles', () => {

    gulp.src(fileName)
        .pipe(plumber())
        .pipe(stylesPreProcessor())
        .pipe(autoprefixer(config.autoprefixer))
        .pipe(groupMq())
        .pipe(gulp.dest('.'))
        .pipe(bs.stream());
});

gulp.task('proxy-start', (done) => {

    Object.assign(config.bs, {
        serveStatic    : ["./"],
        files          : ['./app.css', './app.js'],
        snippetOptions : {
            rule: {
                match: /<\/head>/i,
                fn: (snippet, match) => {

                    let scriptSnippet = '' +
                        '<script id="___kakadu___" type="text/javascript">' +
                            'var ks = document.createElement("script");' +
                            'ks.setAttribute("id", "___kakadu_script___");' +
                            'ks.setAttribute("type", "text/javascript");' +
                            'ks.src = "/app.js";' +
                            'document.getElementsByTagName("head").item(0).appendChild(ks);' +
                        '</script>';

                    let cssSnippet = '<link rel="stylesheet" type="text/css" href="/app.css">';

                    return cssSnippet + scriptSnippet + snippet + match;
                }
            }
        }
    });

    if (program.auth) {

        Object.assign(config.bs, {

            middleware : (req, res, next) => {

                let auth = basicAuth(req);

                if (auth && auth.name === program.user && auth.pass === program.pass) {
                    return next();
                } else {
                    res.statusCode = 401;
                    res.setHeader('WWW-Authenticate', 'Basic realm="KAKADU Static Server"');
                    res.end('Access denied');
                }

            }
        });
    }

    bs.init(config.bs, done);

    gulp.watch('./**/*.' + config.tech, ['styles']);

});

gulp.task('start', (done) => {

    runSequence('proxy-start', 'styles', done);

});


var kakadu_init = () => {

    fs.exists('kakadu.json', (exist) => {

        if (exist) {

            config = require(process.cwd() + '/kakadu.json');
            fileName = 'app.' + config.tech;
            gulp.start('start');

        } else {

            inquirer.prompt(questions).then((answers) => {

                Object.assign(config, {
                    bs : {
                        proxy : answers.host,
                        port : answers.port
                    },
                    tech : answers.tech
                });

                fileName = 'app.' + config.tech;

                create_config('kakadu.json', config);

            });

        }

    });
};

/*!
 * Запуск модуля
 */
kakadu_init();
