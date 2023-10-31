// const readline = require('readline');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);

// 读取 package.json 文件
const packageJsonPath = './package.json';
const packageJson = require(packageJsonPath);

const defaultEslintIgnoreConfig = `
node_modules
coverage
prd
dev
dist
build
packages/*/lib
.eslintrc.js
add.js
`;

let packageJsonChanged = false;

packageJson.dependencies = packageJson.dependencies || {};
packageJson.devDependencies = packageJson.devDependencies || {};

handlePreCommitDependency();
handleEslintConfFile();
handleEslintIgnoreFile();

packageJsonChanged && fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// 输出加载信息
console.log('正在执行 npm install 安装依赖，请稍候...');
// 执行 npm install 来安装新的依赖
exec('npm install', (error) => {
    if (error) {
        console.error(`\x1b[31mError executing npm install: ${error}\x1b[0m`);
    } else {
        console.log('执行 npm install 下载依赖完成');
        packageJsonChanged && console.log('成功在 package.json 中添加 eslint，husky，lint-staged 相关依赖！');
        !packageJsonChanged && console.log('package.json 中已存在 eslint，husky，lint-staged 相关依赖！');
    }
});

/**
 * 提交前检测需要依赖 husky/pre-commit + lint-staged，该函数目的就是为了判断当前项目中是否存在这些依赖，不存在则添加
 */
function handlePreCommitDependency() {
    // 检查是否已经存在 eslint、husky 和 lint-staged 依赖
    const hasEslint = packageJson.devDependencies.eslint;
    const hasHusky = packageJson.devDependencies.husky;
    const hasPreCommit = packageJson.devDependencies['pre-commit'];
    const hasLintStaged = packageJson.devDependencies['lint-staged'];

    if (packageJson.scripts.lintfix) {
        packageJson.scripts.lintfix = 'eslint ./ --fix';
    }

    // 项目中只要缺少其中一种依赖则在 package.json 中添加配置并安装，husky 和 pre-commit 作用一致，不同项目使用的不同所以在这里是二选一
    if (!hasEslint || (!hasHusky && !hasPreCommit) || !hasLintStaged) {
        // 添加 eslint、husky 和 lint-staged 依赖
        // if (!hasEslint) packageJson.devDependencies.eslint = '^5.16.0';

        // 只有当两者都没有的时候再去安装 husky，否则就默认是使用项目中原先的依赖
        if (!hasHusky && !hasPreCommit) {
            // packageJson.devDependencies.husky = '^3.0.5';
            packageJson.devDependencies.husky = '4.3.8';
            // 有则替换 prepare 命令，无则添加
            // prepare 钩子会在 npm install 前执行
            packageJson.scripts = packageJson.scripts || {};
            // packageJson.scripts.prepare = "npx husky install && npx husky add .husky/pre-commit 'npx lint-staged'";
        }
        if (!hasLintStaged) packageJson.devDependencies['lint-staged'] = '^9.2.5';

        // packageJson.devDependencies['eslint-plugin-diff'] = '^2.0.2';
        packageJson.devDependencies['eslint-plugin-diff'] = '1.0.15';

        // 添加 husky 和 lint-staged 配置
        packageJson.husky = {
            hooks: {
                'pre-commit': 'lint-staged',
            },
        };

        packageJson['lint-staged'] = {
            // 'src/**/*.{js,jsx}': ['eslint'],
            // 'source/**/*.{js,jsx}': ['eslint'],
            '*.{js,jsx}': ['eslint'],
        };

        packageJsonChanged = true;

        // 删除 node_modules 目录
        // if (fs.existsSync('node_modules')) {
        //     fs.rmSync('node_modules', { recursive: true });
        //     console.log('node_modules 删除成功');
        // }
    } else {
        console.log('Eslint, husky, and lint-staged dependencies and configuration already exist in package.json.');
    }
}

/**
 * 判断当前根目录中是否存在 eslint 相关配置文件，不存在则创建
 */
function handleEslintConfFile() {
    const configFile = hasESLintConfigFile();
    const extendList = {
        base: '@qnpm/eslint-config-qunar-base',
        node: '@qnpm/eslint-config-qunar-node',
        react: '@qnpm/eslint-config-qunar-react',
        rn: 'eslint-config-qunar-rn',
    };
    if (!configFile) {
        // let type = args && args[0] && args[0].slice(1);
        // const depend = (type && extendList[type]) || extendList.base;

        const extendRules = [];

        if ('react' in packageJson.dependencies) {
            extendRules.push(extendList.react);
        }
        if ('qunar-react-native' in packageJson.dependencies) {
            extendRules.push(extendList.rn);
        }

        if (packageJson && packageJson.name && packageJson.name.indexOf('node') !== -1) {
            extendRules.push(extendList.node);
        }

        if (extendRules.length === 0) {
            extendRules.push(extendList.base);
        }

        // const config = { extends: [depend, 'plugin:diff/diff'] };
        const config = { extends: [...extendRules, 'plugin:diff/diff'] };
        extendRules.forEach(rule => packageJson.devDependencies[rule] = 'latest');
        // packageJson.devDependencies[depend] = 'latest';

        packageJsonChanged = true;
        // 将配置对象转换为字符串
        const configStr = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
        try {
            fs.writeFileSync('.eslintrc.js', configStr);
            console.log('.eslintrc.js 文件创建成功');
        } catch (err) {
            console.error(`\x1b[31m写入配置文件时发生错误: ${err}\x1b[0m`);
        }
    }
}

function hasESLintConfigFile() {
    const filePaths = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml'];
    let configFile = '';

    for (const file of filePaths) {
        const fullPath = path.resolve(file);

        try {
            fs.accessSync(fullPath, fs.constants.F_OK);
            configFile = fullPath;
            break;
        } catch (err) {
            // 文件不存在，继续检查下一个文件
        }
    }

    return configFile;
}

/**
 * 判断当前根目录中是否存在 eslintIgnore 文件，不存在则创建
 */
function handleEslintIgnoreFile() {
    const currentDirectory = process.cwd();
    const eslintIgnorePath = path.join(currentDirectory, '.eslintignore');

    if (!fs.existsSync(eslintIgnorePath)) {
        fs.writeFileSync(eslintIgnorePath, defaultEslintIgnoreConfig);
        console.log('.eslintignore 文件创建成功');
    } else {
        console.log('.eslintignore 文件已存在');
    }
}
