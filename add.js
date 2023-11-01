// const readline = require('readline');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);
// 执行命令时的参数，比如 node add.js -react 那这里拿到的就是 react
const type = args && args[0] && args[0].slice(1);
// 读取 package.json 文件
const packageJsonPath = './package.json';
const packageJson = require(packageJsonPath);

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
add.js
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
.husky
`;

let packageJsonChanged = false;

packageJson.dependencies = packageJson.dependencies || {};
packageJson.devDependencies = packageJson.devDependencies || {};

handlePreCommitDependency();
handleGitIgnoreFile();

packageJsonChanged && fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// 输出加载信息
console.log('正在执行 npm install 安装依赖，请稍候...');
// 执行 npm install 来安装新的依赖
// exec('npm install', (error) => {
//     if (error) {
//         console.error(`\x1b[31mError executing npm install: ${error}\x1b[0m`);
//     } else {
//         console.log('执行 npm install 下载依赖完成');
//         packageJsonChanged ? console.log('成功添加 eslint，husky，lint-staged 相关依赖！') : console.log('package.json 中已存在 eslint，husky，lint-staged 相关依赖！');
//         createHuskyConfig();
//     }
// });

const childProcess = spawn('npm', ['install'], { stdio: 'inherit' });
childProcess.on('close', (code) => {
    if (code === 0) {
        console.log('执行 npm install 下载依赖完成');
        packageJsonChanged ? console.log('成功添加 eslint，husky，lint-staged 相关依赖！') : console.log('package.json 中已存在 eslint，husky，lint-staged 相关依赖!');
        createHuskyConfig();
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
    const hasEslint = packageJson.devDependencies.eslint;
    if (!hasEslint) {
        // 只有 nanachi 需要指定 eslint 版本，其他项目可以通过引入 base 文件来引入 eslint，不需要额外添加
        if (isNanachi || type === 'normal') {
            // nanachi 必须是 5.6.1 这个版本，因为其他包依赖都是 5.6.1
            packageJson.devDependencies.eslint = '^5.6.1';
        } else {
            packageJson.devDependencies.eslint = '^7.5.0';
        }
        packageJsonChanged = true;
    }

    // 如果当前没有 eslint 依赖或者版本过低，则添加相关依赖
    // const currentEslintVersion = packageJson.devDependencies.eslint;
    // if (!currentEslintVersion || isEslintVersionLower(currentEslintVersion, '6.7.0')) {
    //     packageJson.devDependencies.eslint = '^6.7.0';
    //     packageJsonChanged = true;
    // }
    handleEslintConfFile();
    handleEslintIgnoreFile();
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
        ts_base: 'eslint-config-qunar-typescript-base',
        ts_node: '@qnpm/eslint-config-qunar-typescript-node',
        ts_react: '@qnpm/eslint-config-qunar-typescript-react',
        ts_rn: 'eslint-config-qunar-typescript-rn',
    };
    if (!configFile) {
        // let type = args && args[0] && args[0].slice(1);
        // const depend = (type && extendList[type]) || extendList.base;
        let config = {};

        if (isNanachi || type === 'normal') {
            // nanachi 单独写配置
            config = { extends: ['eslint-config-airbnb-base'], parser: 'babel-eslint' };
        } else if (type) {
            const depend = type && extendList[type];
            config = { extends: [depend, 'plugin:diff/diff'] };
            packageJson.devDependencies[depend] = 'latest';
        } else {
            const extendRules = [];
            const isTypescript = 'typescript' in packageJson.dependencies;
            if ('react' in packageJson.dependencies) {
                isTypescript ? extendRules.push(extendList.ts_react) : extendRules.push(extendList.react);
            }
            if ('qunar-react-native' in packageJson.dependencies) {
                isTypescript ? extendRules.push(extendList.ts_rn) : extendRules.push(extendList.rn);
            }

            if (packageJson && packageJson.name && packageJson.name.indexOf('node') !== -1) {
                isTypescript ? extendRules.push(extendList.ts_node) : extendRules.push(extendList.node);
            }

            if (extendRules.length === 0) {
                isTypescript ? extendRules.push(extendList.ts_base) : extendRules.push(extendList.base);
            }

            // const config = { extends: [depend, 'plugin:diff/diff'] };
            config = { extends: [...extendRules, 'plugin:diff/diff'] };
            extendRules.forEach((rule) => (packageJson.devDependencies[rule] = 'latest'));
        }

        packageJsonChanged = true;
        // 将配置对象转换为字符串
        const configStr = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
        try {
            fs.writeFileSync('.eslintrc.js', configStr);
            console.log('.eslintrc.js 文件创建成功');
        } catch (err) {
            console.error(`\x1b[31m写入配置文件时发生错误: ${err}\x1b[0m`);
        }
    } else {
        console.log('eslint 配置文件已存在');
    }
}

function hasESLintConfigFile() {
    const filePaths = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc'];
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
    const currentFileName = path.basename(__filename);
    const lineToAdd = `\n${currentFileName}`; // 当前文件名加换行符

    if (!fs.existsSync(eslintIgnorePath)) {
        fs.writeFileSync(eslintIgnorePath, defaultEslintIgnoreConfig);
        console.log('.eslintignore 文件创建成功');
    } else {
        console.log('.eslintignore 文件已存在');
        // 如果文件已存在，读取文件内容
        const existingContent = fs.readFileSync(eslintIgnorePath, 'utf-8');
        // 判断是否已存在当前文件名，不存在再添加
        if (!existingContent.includes(currentFileName)) {
            fs.appendFileSync(eslintIgnorePath, lineToAdd);
        }
    }
}

/**
 * 处理 husky 相关依赖及配置
 */
function handleHuskyDependency() {
    const hasHusky = packageJson.devDependencies.husky;
    if (!hasHusky) {
        packageJson.devDependencies.husky = '^3.0.5';
        // 有则替换 prepare 命令，无则添加
        // prepare 钩子会在 npm install 前执行
        // packageJson.scripts = packageJson.scripts || {};
        // packageJson.scripts.prepare = "npx husky install && npx husky add .husky/pre-commit 'npx lint-staged'";

        // packageJson.husky = {
        //     hooks: {
        //         'pre-commit': 'lint-staged',
        //     },
        // };
        packageJsonChanged = true;
    }
    // 执行完 npm install 后再执行创建配置
    // createHuskyConfig();
}

function createHuskyConfig() {
    const huskyFolder = './.husky';
    // 检查是否存在.husky文件夹
    if (!fs.existsSync(huskyFolder)) {
        // 如果不存在，执行创建命令
        console.log('正在创建 husky 配置文件，请等待');
        // 执行 npm install 来安装新的依赖
        exec("npx husky install && npx husky add .husky/pre-commit 'npx lint-staged'", (error) => {
            if (error) {
                console.error(`\x1b[31mError executing npm install: ${error}\x1b[0m`);
            } else {
                console.log('husky 配置文件创建成功');
            }
        });
    } else {
        console.log('.husky文件夹已存在');
    }
}

/**
 * 处理 lint-staged 相关依赖及配置
 */
function handleLintStagedDependency() {
    const hasLintStaged = packageJson.devDependencies['lint-staged'];
    if (!hasLintStaged) {
        packageJson.devDependencies['lint-staged'] = '^9.2.5';
        packageJsonChanged = true;
    }

    if (!packageJson['lint-staged']) {
        packageJson['lint-staged'] = {
            'src/**/*.{js,jsx}': ['eslint'],
            'source/**/*.{js,jsx}': ['eslint'],
            // '*.{js,jsx}': ['eslint'],
        };
    }
}

/**
 * 处理 eslint-plugin-diff 相关依赖及配置
 */
function handleEslintPluginDiffDependency() {
    const currentEslintVersion = packageJson.devDependencies.eslint;
    // nanachi 或者 eslint 版本较低时都不使用 diff，不支持，nanachi 本质也是因为 eslint 版本较低
    if (isNanachi) return;
    if (isEslintVersionLower(currentEslintVersion, '6.7.0')) return;
    packageJson.devDependencies['eslint-plugin-diff'] = '1.0.15'; // 适配低版本 node
    packageJsonChanged = true;
}

function handleNanachiDependency() {
    const hasEslint = packageJson.devDependencies.eslint;
    // 对 nanachi 项目单独进行配置
    if (isNanachi) {
        // packageJson['pre-commit'] = ['lint-staged'];
        // packageJson.scripts['lint-staged'] = 'lint-staged';
        if (!hasEslint) {
            packageJson.devDependencies.eslint = '^5.6.1';
            packageJsonChanged = true;
        }
        packageJson.devDependencies['eslint-config-airbnb-base'] = '^15.0.0';
        packageJson.devDependencies['eslint-plugin-import'] = '^2.29.0';
        packageJson.devDependencies['babel-eslint'] = '^10.0.1';
    }
}

/**
 * 判断当前根目录中是否存在 gitIgnore 文件，不存在则创建
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
 * 比较 eslint 版本
 */
function isEslintVersionLower(currentVersion, targetVersion) {
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
