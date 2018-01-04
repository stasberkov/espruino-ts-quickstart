const gulp = require('gulp');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const fs = require("fs");
const { fork } = require('child_process');
const path = require("path");
const yaml = require("js-yaml");
const _ = require("lodash");

const envConfig = yaml.load(fs.readFileSync("env-config.yaml"));

const distDir = "./dist";
const srcDir = "./src";
const espReadyBundleFileName = "bundle.js";
const espReadyBundlePath = path.join(distDir, espReadyBundleFileName);
const appFileName = "app.js";
const appFilePath = path.join(distDir, appFileName);
const appConfigTsFileName = "app-config.ts";
const appConfigFileName = "app-config.yaml";
const userAppConfigFileName = "app-config.user.yaml";
const espConsoleBeingWatchedFileName = "esp-console-input.js";
const espConsoleBeingWatchedFilePath = path.join(distDir, espConsoleBeingWatchedFileName);

gulp.task("build", ["prepare-for-espruino"]);

gulp.task("prepare-for-espruino", ['compile-ts', 'content-to-dist'], (cb) => {
    if (!fs.existsSync(appFilePath)) {
        cb("main app file does not exit " + appFilePath);
        return;
    }

    let appContent = fs.readFileSync(appFilePath).toString();
    appContent = appContent.replace('Object.defineProperty(exports, "__esModule", { value: true });', "");
    fs.writeFileSync(appFilePath, appContent);

    const buildproc = fork(
        require.resolve("espruino/bin/espruino-cli"),
        ["--board", envConfig.board, appFileName, "-o", espReadyBundleFileName],
        { cwd: distDir });
    buildproc.on('close', (code) => {
        cb();
    });
});

gulp.task("compile-ts", ["gen-config-ts"], function () {
    const tsResult = tsProject.src().pipe(tsProject());
    return tsResult.js.pipe(gulp.dest(distDir));
});

gulp.task("content-to-dist", () => {
    return gulp
        .src("src/**/*.js", { base: 'src' })
        .pipe(gulp.dest(distDir));
});

gulp.task("send-to-espurino-console", (cb) => {
    const content = fs.readFileSync(espReadyBundlePath);
    fs.writeFile(
        espConsoleBeingWatchedFilePath,
        content,
        (err) => {
            if (err) { throw err; }
            cb();
        });
});

gulp.task("clear-espurino-watch-file", (cb) => {
    fs.writeFile(
        espConsoleBeingWatchedFilePath,
        "",
        (err) => {
            if (err) { throw err; }
            cb();
        });
});

gulp.task("espruino-console", ["clear-espurino-watch-file"], (cb) => {
    const buildproc = fork(
        require.resolve("espruino/bin/espruino-cli"),
        ["--board", envConfig.board, "-b", envConfig.port_speed, "--port", envConfig.port, "-w", espConsoleBeingWatchedFileName],
        { cwd: distDir });
    buildproc.on('close', (code) => {
        cb();
    });
});

gulp.task("gen-config-ts", (cb) => {
    if (!fs.existsSync(userAppConfigFileName)) {
        const content = fs.readFileSync(appConfigFileName)
            .toString()
            .split("\n")
            .map(x => `# ${x}`)
            .join("\n");

        fs.writeFileSync(userAppConfigFileName, content, { encoding: "utf-8" });
    }

    const appConfig = yaml.load(fs.readFileSync(appConfigFileName));
    const userAppConfig = yaml.load(fs.readFileSync(userAppConfigFileName));
    const mergedAppConfig = _.assign(appConfig, userAppConfig);
    const jsonString = JSON.stringify(mergedAppConfig);
    const resultConfigTsContent = `export default ${jsonString};`;
    fs.writeFileSync(path.join(srcDir, appConfigTsFileName), resultConfigTsContent);
    cb();
});