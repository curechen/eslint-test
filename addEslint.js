#!/usr/bin/env node
// const readline = require('readline');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);
// 读取 package.json 文件
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = require(packageJsonPath);

// 执行命令时的参数，比如 node add.js -react 那这里拿到的就是 react
const productType = judgeProjectType();
const isNanachi = packageJson && packageJson.name && packageJson.name.indexOf('nnc') !== -1;

const defaultEslintIgnoreConfig = `
node_modules
coverage
prd
dev
dist
build
packages/*/lib
.eslintrc.js
`;

const defaultGitIgnoreConfig = `
# kdiff3 ignore
*.orig

# maven ignore
target/
node_modules/

# eclipse ignore
.settings/
.project
.classpath

# idea ignore
.idea/
*.ipr
*.iml
*.iws

# temp ignore
*.log
*.cache
*.diff
*.patch
*.tmp

# system ignore
.DS_Store
Thumbs.db

# package ignore (optional)
# *.jar
# *.war
# *.zip
# *.tar
# *.tar.gz

# pods ignore
Pods/

package-lock.json
`;

let packageJsonChanged = false;

packageJson.dependencies = packageJson.dependencies || {};
packageJson.devDependencies = packageJson.devDependencies || {};

handlePreCommitDependency();
// handleGitIgnoreFile();

packageJsonChanged && fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// 输出加载信息
console.log('正在执行 npm install 安装依赖，请稍候...');
// 执行 npm install 来安装新的依赖
const childProcess = spawn('npm', ['install'], { stdio: 'inherit' });
childProcess.on('close', (code) => {
    if (code === 0) {
        console.log('执行 npm install 下载依赖完成');
        packageJsonChanged
            ? console.log('成功添加 eslint，husky，lint-staged 相关依赖！')
            : console.log('package.json 中已存在 eslint，husky，lint-staged 相关依赖!');
        // createHuskyConfig();
        handleGitConfigFile();
    }
});
// 添加信号处理程序，以便在接收到Ctrl+C信号时终止子进程
process.on('SIGINT', () => {
    childProcess.kill('SIGINT');
});

/**
 * 提交前检测需要依赖 eslint + husky/pre-commit + lint-staged，该函数目的就是为了判断当前项目中是否存在这些依赖，不存在则添加
 */
function handlePreCommitDependency() {
    handleEslintDependency();
    handleHuskyDependency();
    handleLintStagedDependency();
    handleEslintPluginDiffDependency();
    handleNanachiDependency();
}

/**
 * 处理 eslint 相关依赖及配置
 */
function handleEslintDependency() {
    const hasEslint = packageJson.devDependencies.eslint || packageJson.dependencies.eslint;
    const currentEslintVersion = hasEslint;
    // 如果当前没有 eslint 依赖或者版本过低，则添加相关依赖
    if (!hasEslint) {
        // nanachi 需要指定 eslint 版本，或者不需要配置 diff 插件的情况，只需要最基础的 eslint 配置，diff 插件需要最低 eslint 版本为 6.7.0
        if (isNanachi || productType === 'normal') {
            // nanachi 必须是 5.6.1 这个版本，因为其他包依赖都是 5.6.1
            packageJson.devDependencies.eslint = '^5.6.1';
            packageJson.devDependencies['babel-eslint'] = '^10.0.1';
        } else {
            packageJson.devDependencies.eslint = '^6.7.0';
        }
        packageJsonChanged = true;
    } else if (isCurrentVerLowerThanTargetVer(currentEslintVersion, '6.7.0')) {
        if (packageJson.devDependencies.eslint) packageJson.devDependencies.eslint = '^6.7.0';
        else packageJson.dependencies.eslint = '^6.7.0';
        packageJsonChanged = true;
    }

    // rn 添加 @babel/eslint-parser
    if (productType === 'rn') {
        const hasEslintParser =
            packageJson.devDependencies['@babel/eslint-parser'] ||
            packageJson.dependencies['@babel/eslint-parser'];
        const currentEslintParserVersion = hasEslintParser;
        if (!hasEslintParser) {
            packageJson.devDependencies['@babel/eslint-parser'] = '^7.23.3';
            packageJsonChanged = true;
        } else if (isCurrentVerLowerThanTargetVer(currentEslintParserVersion, '7.23.3')) {
            if (packageJson.devDependencies['@babel/eslint-parser'])
                packageJson.devDependencies['@babel/eslint-parser'] = '^7.23.3';
            else packageJson.dependencies['@babel/eslint-parser'] = '^7.23.3';
            packageJsonChanged = true;
        }
    }

    // ts 添加 @typescript-eslint/parser
    if (productType.includes('ts')) {
        const hasTsEslintParser =
            packageJson.devDependencies['@typescript-eslint/parser'] ||
            packageJson.dependencies['@typescript-eslint/parser'];
        const currentTsEslintParserVersion = hasTsEslintParser;
        if (!hasTsEslintParser) {
            packageJson.devDependencies['@typescript-eslint/parser'] = '^5.62.0';
            packageJsonChanged = true;
        } else if (isCurrentVerLowerThanTargetVer(currentTsEslintParserVersion, '5.62.0')) {
            if (packageJson.devDependencies['@typescript-eslint/parser'])
                packageJson.devDependencies['@typescript-eslint/parser'] = '^5.62.0';
            else packageJson.dependencies['@typescript-eslint/parser'] = '^5.62.0';
            packageJsonChanged = true;
        }
    }

    handleEslintConfFile();
    handleEslintIgnoreFile();
}

/**
 * 判断当前根目录中是否存在 eslint 相关配置文件，不存在则创建
 */
function handleEslintConfFile() {
    const configFilePath = hasESLintConfigFile();
    const extendList = {
        base: '@qnpm/eslint-config-qunar-base',
        node: '@qnpm/eslint-config-qunar-node',
        react: '@qnpm/eslint-config-qunar-react',
        rn: 'eslint-config-qunar-rn',
        ts_base: 'eslint-config-qunar-typescript-base',
        ts_node: '@qnpm/eslint-config-qunar-typescript-node',
        ts_react: '@qnpm/eslint-config-qunar-typescript-react',
        ts_rn: 'eslint-config-qunar-typescript-rn',
    };
    const diffPluginExtends = 'plugin:diff/diff';
    if (!configFilePath) {
        let config = {};

        const currentEslintVersion =
            packageJson.devDependencies.eslint || packageJson.dependencies.eslint;
        if (isNanachi || productType === 'normal') {
            // nanachi 单独写配置
            config = { extends: ['eslint:recommended'], parser: 'babel-eslint' };
        } else {
            const depend = productType && extendList[productType];
            config = { extends: [depend] };
            // rn 项目中引入的 eslint 依赖 babel-parser 10.1 版本在检验模版字符串的时候会有问题，采用新版本代替 babel-parser 进行解决
            if (productType === 'rn') {
                config = { ...config, parser: '@babel/eslint-parser' };
            }
            // ts 项目中必须引入 @typescript-eslint/parser 作为解析器
            if (productType.includes('ts')) {
                config = { ...config, parser: '@typescript-eslint/parser' };
            }
            // 高版本 eslint 添加 diff 拓展
            !isCurrentVerLowerThanTargetVer(currentEslintVersion, '6.7.0') &&
                config.extends.push(diffPluginExtends);
            packageJson.devDependencies[depend] = 'latest';
        }
        config.rules = {
            'no-unused-expressions': 'error',
            indent: ['error', 4],
        };

        packageJsonChanged = true;

        // 格式化 eslint config 统一格式
        const eslintConfig = formatEslintConfig(config);

        // 将配置对象转换为字符串
        // const eslintConfig = `module.exports = ${JSON.stringify(config, null, 2)};\n`;

        try {
            fs.writeFileSync(path.resolve(process.cwd(), '.eslintrc.js'), eslintConfig);
            console.log('.eslintrc.js 文件创建成功');
        } catch (err) {
            console.error(`\x1b[31m写入配置文件时发生错误: ${err}\x1b[0m`);
        }
    } else {
        console.log('eslint 配置文件已存在');
        const config = fs.readFileSync(configFilePath, 'utf8');
        // const config = require(configFilePath);
        const updatedConfig = addNecessaryToEslintConfig(config);

        fs.writeFileSync(configFilePath, updatedConfig, 'utf8');
    }
}
/**
 * 添加必要 plugin，parser 到配置文件中，比如在 extends 中添加 diff 插件，设置 parser
 */
function addNecessaryToEslintConfig(config) {
    // config.extends = config.extends || [];
    // if (!config.extends.includes('plugin:diff/diff')) config.extends.push('plugin:diff/diff');

    // // 添加 parser
    // if (productType === 'rn') config.parser = '@babel/eslint-parser';
    // else if (productType.includes('ts')) config.parser = '@typescript-eslint/parser';

    // // 格式化 eslint config 统一格式
    // const eslintConfig = formatEslintConfig(config);
    // return eslintConfig;

    const lines = config.split('\n');
    const extendsIndex = lines.findIndex((line) => line.includes('extends: ['));

    if (extendsIndex !== -1) {
        const extendsLine = lines[extendsIndex];
        if (!extendsLine.includes('plugin:diff/diff')) {
            lines[extendsIndex] = extendsLine.replace('[', `['plugin:diff/diff', `);
        }
    } else {
        // 如果没有找到 extends 行，创建一个新 extends 行
        const moduleExportsIndex = lines.findIndex((line) => line.includes('module.exports'));
        if (moduleExportsIndex !== -1) {
            lines.splice(moduleExportsIndex + 1, 0, "    extends: ['plugin:diff/diff'],");
        }
    }

    const parserIndex = lines.findIndex((line) => line.includes('parser: '));
    let parserStr = '';
    if (productType === 'rn') parserStr = '@babel/eslint-parser';
    else if (productType.includes('ts')) parserStr = '@typescript-eslint/parser';
    if (parserIndex !== -1) {
        const parserLine = lines[parserIndex];
        if (!parserLine.includes(parserStr)) {
            lines[parserIndex] = `    parser: '${parserStr}',`;
        }
    } else {
        // 如果没有找到 extends 行，创建一个新 extends 行
        const moduleExportsIndex = lines.findIndex((line) => line.includes('module.exports'));
        if (moduleExportsIndex !== -1) {
            lines.splice(moduleExportsIndex + 1, 0, `    parser: '${parserStr}',`);
        }
    }

    return lines.join('\n');
}

/**
 * 格式化 eslint config 文件
 */
function formatEslintConfig(config) {
    // 递归处理值，将数组和对象转换为字符串形式
    function stringifyValue(value) {
        if (Array.isArray(value)) {
            return `[${value.map((item) => stringifyValue(item)).join(', ')}]`;
        } else if (typeof value === 'object') {
            const entries = Object.entries(value).map(
                ([key, innerValue]) => `'${key}': ${stringifyValue(innerValue)}`,
            );
            return `{${entries.join(', ')}}`;
        } else if (typeof value === 'string') {
            return `'${value}'`;
        } else {
            return value; // 保留数字和布尔类型的原始值
        }
    }

    // 构建ESLint配置对象字符串
    const eslintConfigString = Object.entries(config)
        .map(([key, value]) => `  ${key}: ${stringifyValue(value)}`)
        .join(',\n');

    // 构建完整的ESLint配置文件字符串
    const eslintConfig = `module.exports = {\n${eslintConfigString}\n};\n`;
    return eslintConfig;
}

/**
 * 检测当前项目是否含有 eslint 配置文件，如果没有返回空字符串，如果有则返回文件地址
 */
function hasESLintConfigFile() {
    const filePaths = [
        'eslint.config.js',
        '.eslintrc.js',
        '.eslintrc.cjs',
        '.eslintrc.yaml',
        '.eslintrc.yml',
        '.eslintrc.json',
    ];
    let configFilePath = '';

    for (const file of filePaths) {
        const fullPath = path.resolve(process.cwd(), file);

        try {
            fs.accessSync(fullPath, fs.constants.F_OK);
            configFilePath = fullPath;
            break;
        } catch (err) {
            // 文件不存在，继续检查下一个文件
        }
    }

    return configFilePath;
}

/**
 * 判断当前根目录中是否存在 eslintIgnore 文件，不存在则创建
 */
function handleEslintIgnoreFile() {
    const currentDirectory = process.cwd();
    const eslintIgnorePath = path.join(currentDirectory, '.eslintignore');
    const currentFileName = path.basename(__filename);
    const lineToAdd = `\n${currentFileName}`; // 当前文件名加换行符

    if (!fs.existsSync(eslintIgnorePath)) {
        fs.writeFileSync(eslintIgnorePath, defaultEslintIgnoreConfig);
        console.log('.eslintignore 文件创建成功');
    }
}

/**
 * 处理 husky 相关依赖及配置，强制替换项目中版本为 ^3.0.5
 */
function handleHuskyDependency() {
    if (packageJson.dependencies.husky) {
        packageJson.dependencies.husky = '^3.0.5';
    } else {
        packageJson.devDependencies.husky = '^3.0.5';
    }
    // prepare 钩子会在 npm install 前执行
    // packageJson.scripts = packageJson.scripts || {};
    // packageJson.scripts.prepare = "npx husky install && npx husky add .husky/pre-commit 'npx lint-staged'";

    packageJson.husky = {
        hooks: {
            'pre-commit': 'lint-staged',
        },
    };
    packageJsonChanged = true;
}

// 高版本 husky 需要创建 .husky 文件夹，但目前 husky 全部替换为低版本，所以这个函数不再需要使用
function createHuskyConfig() {
    const huskyFolder = path.resolve(process.cwd(), '.husky');
    // const huskyFolder = './.husky';
    // 检查是否存在.husky文件夹
    if (!fs.existsSync(huskyFolder)) {
        // 如果不存在，执行创建命令
        console.log('正在创建 husky 配置文件，请等待');
        // 执行 npm install 来安装新的依赖
        // process.chdir(process.cwd());
        exec(
            `npx husky install && npx husky add ${huskyFolder}/pre-commit 'npx lint-staged'`,
            { stdio: 'inherit' },
            (error) => {
                if (error) {
                    console.error(`\x1b[31mError executing npm install: ${error}\x1b[0m`);
                } else {
                    console.log('husky 配置文件创建成功');
                }
            },
        );
    } else {
        console.log('.husky文件夹已存在');
    }
}

/**
 * 处理 lint-staged 相关依赖及配置
 */
function handleLintStagedDependency() {
    const hasLintStaged =
        packageJson.devDependencies['lint-staged'] || packageJson.dependencies['lint-staged'];
    if (!hasLintStaged) {
        packageJson.devDependencies['lint-staged'] = '^9.2.5';
        packageJsonChanged = true;
    }

    // 替换项目 package.json 中 lint-staged 的配置
    // 这里主要是考虑到有些项目里可能会有 fix，导致不合规代码直接被修改，出现问题
    packageJson['lint-staged'] = {
        // 'src/**/*.{js,jsx}': ['eslint'],
        // 'source/**/*.{js,jsx}': ['eslint'],
        '*.{js,jsx,ts,tsx}': ['eslint'],
    };
}

/**
 * 处理 eslint-plugin-diff 相关依赖及配置
 */
function handleEslintPluginDiffDependency() {
    const currentEslintVersion =
        packageJson.devDependencies.eslint || packageJson.dependencies.eslint;
    // nanachi 或者 eslint 版本较低时都不使用 diff，不支持，nanachi 本质也是因为 eslint 版本较低
    if (isNanachi) return;
    if (isCurrentVerLowerThanTargetVer(currentEslintVersion, '6.7.0')) return;
    packageJson.devDependencies['eslint-plugin-diff'] = '1.0.15'; // 适配低版本 node
    packageJsonChanged = true;
}

function handleNanachiDependency() {
    const hasEslint = packageJson.devDependencies.eslint || packageJson.dependencies.eslint;
    // 对 nanachi 项目单独进行配置
    if (isNanachi) {
        // packageJson['pre-commit'] = ['lint-staged'];
        // packageJson.scripts['lint-staged'] = 'lint-staged';
        if (!hasEslint) {
            packageJson.devDependencies.eslint = '^5.6.1';
            packageJsonChanged = true;
        }
        packageJson.devDependencies['babel-eslint'] = '^10.0.1';
    }
}

/**
 * 判断当前根目录中是否存在 gitIgnore 文件，不存在则创建，已废弃，现在不再需要使用
 */
function handleGitIgnoreFile() {
    const currentDirectory = process.cwd();
    const gitIgnorePath = path.join(currentDirectory, '.gitignore');
    const currentFileName = path.basename(__filename);

    if (!fs.existsSync(gitIgnorePath)) {
        fs.writeFileSync(gitIgnorePath, defaultGitIgnoreConfig);
        console.log('.gitignore 文件创建成功');
    } else {
        console.log('.gitignore 文件已存在');
        // 如果文件已存在，添加 .husky 文件夹
        const existingContent = fs.readFileSync(gitIgnorePath, 'utf-8');
        if (!existingContent.includes('.husky')) {
            fs.appendFileSync(gitIgnorePath, `\n.husky`);
        }
        if (!existingContent.includes(currentFileName)) {
            fs.appendFileSync(gitIgnorePath, `\n${currentFileName}`);
        }
    }
}

/**
 * 修改 .git 文件夹的 config 配置文件，让 git hook 都走本地的 hooks，这里正常情况下是不用配置的，
 * 但是为了适配比如云开发环境可能配置了全局 hooksPath，这就会导致不走本地的 hooks，然后 pre-commit 就不会触发
 */
function handleGitConfigFile() {
    exec('git config --local core.hooksPath .git/hooks', (error) => {
        if (error) {
            console.error(`\x1b[31m配置本地 core.hooksPath 失败: ${error}\x1b[0m`);
        } else {
            console.log('配置本地 core.hooksPath 成功');
        }
    });
}

/**
 * 判断项目类型
 */
function judgeProjectType() {
    let productType = args && args[0] && args[0].slice(1);
    if (!productType) {
        const isTypescript =
            'typescript' in packageJson.dependencies || 'typescript' in packageJson.devDependencies;
        if ('react' in packageJson.dependencies) {
            productType = isTypescript ? 'ts_react' : 'react';
        } else if ('qunar-react-native' in packageJson.dependencies) {
            productType = isTypescript ? 'ts_rn' : 'rn';
        } else if (packageJson && packageJson.name && packageJson.name.indexOf('node') !== -1) {
            productType = isTypescript ? 'ts_node' : 'node';
        } else {
            productType = isTypescript ? 'ts_base' : 'base';
        }
    }
    return productType;
}

/**
 * 比较依赖版本 currentVersion < targetVersion 的情况返回 true
 */
function isCurrentVerLowerThanTargetVer(currentVersion, targetVersion) {
    if (!currentVersion || !targetVersion) {
        return false;
    }

    const normalizedCurrentVersion = currentVersion.replace('^', '');
    const normalizedTargetVersion = targetVersion.replace('^', '');

    const currentParts = normalizedCurrentVersion.split('.').map((part) => parseInt(part, 10));
    const targetParts = normalizedTargetVersion.split('.').map((part) => parseInt(part, 10));

    for (let i = 0; i < targetParts.length; i++) {
        if (currentParts[i] < targetParts[i]) {
            return true;
        } else if (currentParts[i] > targetParts[i]) {
            return false;
        }
    }

    return false;
}
