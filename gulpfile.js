let { env } = process;
if (!('dev' in env)) require('dotenv').config();
let dev = 'dev' in env && env.dev.toString() == "true";

const gulp = require('gulp');
const { src, task, series, dest, watch } = gulp;

const { babelConfig } = require(`./browserslist${dev ? '' : ".min"}`);
const nodeResolve = require('rollup-plugin-node-resolve');
const config = require(`./config${dev ? '' : ".min"}`);
const { init, write } = require('gulp-sourcemaps');
const commonJS = require('rollup-plugin-commonjs');
const rollupBabel = require('rollup-plugin-babel');
const uglify = require('gulp-uglify-es').default;
const inlineSrc = require("gulp-inline-source");
const replace = require('gulp-string-replace');
const { html, js } = require('gulp-beautify');
const rollup = require('gulp-better-rollup');
const { spawn } = require('child_process');
const htmlmin = require('gulp-htmlmin');
const assets = require("cloudinary").v2;
const postcss = require('gulp-postcss');
const rename = require('gulp-rename');
const babel = require('gulp-babel');
const { writeFile } = require("fs");
const sass = require('gulp-sass');
const pug = require('gulp-pug');

let { pages, cloud_name, imageURLConfig } = config;
let staticSite = 'staticSite' in env && env.staticSite == "true";

let assetURL = `https://res.cloudinary.com/${cloud_name}/`;
assets.config({ cloud_name, secure: true });

let htmlMinOpts = {
    minifyJS: true,
    minifyCSS: true,
    removeComments: true,
    collapseWhitespace: true,
    removeEmptyAttributes: false,
    removeRedundantAttributes: false,
    processScripts: ["application/ld+json"]
};

let minSuffix = { suffix: ".min" };
let watchDelay = { delay: 500 };
let publicDest = 'public';

// Streamlines Gulp Tasks
let stream = (_src, _opt = { pipes: [], dest: publicDest }, done) => {
    let host = src(_src, _opt.opts), _pipes = _opt.pipes || [], _dest = _opt.dest || publicDest;
    return new Promise((resolve, reject) => { 
        _pipes.forEach(val => { host = host.pipe(val).on('error', reject); });
        host = host.pipe(dest(_dest))
                   .on('end', typeof done == 'function' ? done : resolve); // Output
    });
};

let streamList = (...args) => {
    return Promise.all(
        args.map(_stream => 
            Array.isArray(_stream) ? stream(..._stream) : _stream
        )
    );
}; 

// Stringify
let stringify = obj => {
    let fns = [];
    let json = JSON.stringify(obj, (key, val) => {
        if (typeof val == "function") {
            fns.push(val.toString());
            return "_";
        }
        return val;
    }, 4);

    return json.replace(/\"_\"/g, () => fns.shift());
};

// Based on: [https://gist.github.com/millermedeiros/4724047]
let exec = cmd => {
    var parts = cmd.toString().split(/\s+/g);
    console.log(`${cmd} - What is going on`)
    return new Promise((resolve, reject) => {
        spawn(parts[0], parts.slice(1), { stdio: 'inherit' })
            .on('data', data => process.stdout.write(data))
            .on('error', reject || function () {})
            .on('exit', resolve || function () {});
    });
};

// Execute multiple commands in series
let execSeries = cmds => {
    return Promise.all(
        cmds.map(cmd => exec(cmd)) 
    );
};

task('html', () => {
    let pageNames = Object.keys(pages);
    let pageValues = Object.values(pages);
    return streamList(
        ...pageValues.map((page, i) => 
            ['views/app.pug', {
                pipes: [
                    // Rename
                    rename({
                        basename: pageNames[i],
                        extname: ".html"
                    }),
                    // Pug compiler
                    pug({ locals: { ...page, cloud_name } }),
                    // Minify or Beautify html
                    dev ? html({ indent_size: 4 }) : htmlmin(htmlMinOpts),
                    // Replace /assets/... URLs
                    replace(/\/assets\/[^\s\"\']+/g, url => {
                        let URLObj = new URL(`${assetURL + url}`.replace("/assets/", ""));
                        let query = URLObj.searchParams;
                        let queryString = URLObj.search;

                        let height = query.get("h");
                        let width = query.get("w") || 'auto';
                        let imgURLConfig = { ...imageURLConfig, width, height };

                        return staticSite ?
                                (/\/raw\/[^\s\"\']+/.test(url) ?
                                    `${assetURL + url.replace(queryString, '')}` :
                                    assets.url(url.replace(queryString, ''), imgURLConfig)
                                ).replace("/assets/", "") : url;
                    })
                ].concat(staticSite ? replace(/\/js\/app.js/g, "./js/app.min.js") : [])
            }]
        )
    );
});

task("css", () =>
    stream('src/scss/app.scss', {
        pipes: [
            init(), // Sourcemaps init
            // Minify scss to css
            sass({ outputStyle: dev ? 'expanded' : 'compressed' }).on('error', sass.logError),
            // Autoprefix &  Remove unused CSS
            postcss(), // Rest of code is in postcss.config.js
            rename(minSuffix), // Rename
            write('./') // Put sourcemap in public folder
        ],
        dest: `${publicDest}/css` // Output
    })
);

task("js", () => 
    streamList(
        ...["modern", "general"].map(type => [
            ['src/js/app.js', {
                opts: { allowEmpty: true },
                pipes: [
                    init(), // Sourcemaps init
                    // Bundle Modules
                    rollup({
                        plugins: [
                            commonJS(), // Use CommonJS to compile the program
                            nodeResolve(), // Bundle all Modules
                            rollupBabel(babelConfig[type]) // ES5 file for uglifing
                        ] 
                    }, type == 'general' ? 'umd' : 'es'),
                    dev ? js() : uglify(), // Minify the file
                    rename(`app${type == 'general' ? '' : `-${type}`}.min.js`), // Rename
                    write('./') // Put sourcemap in public folder
                ],
                dest: `${publicDest}/js` // Output
            }]
        ]).flat()
    )
);

task("server", () =>
    stream(["*.js", "!postcss.config.js", "!*.min.js", "!gulpfile.js", "!config.js", "!config-dev.js"], {
        opts: { allowEmpty: true },
        pipes: [
            babel(babelConfig.node), // ES5 file for uglifing
            uglify(), // Minify the file
            rename(minSuffix) // Rename
        ],
        dest: '.' // Output
    })
);

task("config", () =>
    streamList(
        new Promise((resolve, reject) => {
            // Create config.min
            writeFile(
                "./config.min.js", `module.exports = ${stringify(config)};`,
                err => { 
                    if (err) { reject(); throw err; }
                    resolve(); 
                }
            );
        }),
        ["config.min.js", {
            opts: { allowEmpty: true },
            pipes: [
                babel(babelConfig.node), // ES5 file for uglifing
                uglify() // Minify the file
            ],
            dest: '.' // Output
        }],
        ["config.min.js", {
            opts: { allowEmpty: true },
            pipes: [
                js({ indent_size: 4 }), // Beautify the file
                // Rename
                rename({
                    basename: "config-dev",
                    extname: ".js"
                })
            ],
            dest: '.' // Output
        }]
    )
);

task("config:watch", () => 
    exec("gulp config server html --gulpfile ./gulpfile.min.js")
);

task("update", () =>
    stream("gulpfile.js", {
        opts: { allowEmpty: true },
        pipes: [
            babel(babelConfig.node), // ES5 file for uglifing
            uglify(), // Minify the file
            rename(minSuffix) // Rename
        ],
        dest: '.' // Output
    })
);

task("gulpfile:watch", () => 
    execSeries(["gulp update", "gulp"]) 
);

task("git", () =>
    execSeries([
        "git add .",
        "git commit -m 'Upgrade'",
        "git push -u origin master"
    ])
);

task('inline', () =>
    stream('public/*.html', {
        pipes: [
            // Inline external sources
            inlineSrc({ compress: false })
        ]
    })
);

// Gulp task to minify all files
task('default', series("update", "config", "server", "html", "css", "js", "inline"));

// Gulp task to minify all files without -js
task('other', series("update", "config", "server", "html", "css", "inline"));

// Gulp task to check to make sure a file has changed before minify that file files
task('watch', () => {
    watch(['config.js', 'containers/*.js'], watchDelay, series('config:watch'));
    watch(['gulpfile.js', 'postcss.config.js'], watchDelay, series('gulpfile:watch', 'server'));
    watch(['server.js', 'plugin.js'], watchDelay, series('server'));
    watch('views/**/*.pug', watchDelay, series('html', 'server', 'css', 'inline'));
    watch('src/**/*.scss', watchDelay, series('css', 'server', 'inline'));
    watch('src/**/*.js', watchDelay, series('js', 'server', 'inline'));
});

module.exports = gulp;