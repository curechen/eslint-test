// const readline = require('readline');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);

// 读取 package.json 文件
const packageJsonPath = './package.json';
const packageJson = require(packageJsonPath);

packageJson.devDependencies = packageJson.devDependencies || {};

handlePreCommitDependency();

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
        // if (!hasEslint) packageJson.devDependencies.eslint = '^8.52.0';

        // 只有当两者都没有的时候再去安装 husky，否则就默认是使用项目中原先的依赖
        if (!hasHusky && !hasPreCommit) {
            packageJson.devDependencies.husky = '^8.0.3';
            // 有则替换 prepare 命令，无则添加
            // prepare 钩子会在 npm install 前执行
            packageJson.scripts = packageJson.scripts || {};
            packageJson.scripts.prepare = "npx husky install && npx husky add .husky/pre-commit 'npx lint-staged'";
        }
        if (!hasLintStaged) packageJson.devDependencies['lint-staged'] = '^15.0.2';

        packageJson.devDependencies['eslint-plugin-diff'] = '^2.0.2';

        // 添加 husky 和 lint-staged 配置
        packageJson.husky = {
            hooks: {
                'pre-commit': 'lint-staged',
            },
        };

        packageJson['lint-staged'] = {
            '*.{js,jsx}': ['eslint'],
        };

        // 判断有没有eslint配置文件
        handleEslintConfFile();

        // 写回 package.json 文件
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

        // 删除 node_modules 目录
        // if (fs.existsSync('node_modules')) {
        //     fs.rmSync('node_modules', { recursive: true });
        //     console.log('node_modules 删除成功');
        // }

        // 输出加载信息
        console.log('正在执行 npm install，请稍候...');
        // 执行 npm install 来安装新的依赖
        exec('npm install', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing npm install: ${error}`);
            } else {
                // console.log('npm install completed.');
                console.log('执行 npm install 下载依赖完成');
                console.log('成功在 package.json 中添加 eslint，husky，lint-staged 相关依赖！');
            }
        });
    } else {
        console.log('Eslint, husky, and lint-staged dependencies and configuration already exist in package.json.');
    }
}

function handleEslintConfFile() {
    const configFile = hasESLintConfigFile();
    const extendList = {
        base: '@qnpm/eslint-config-qunar-base',
        node: '@qnpm/eslint-config-qunar-node',
        react: '@qnpm/eslint-config-qunar-react',
        rn: 'eslint-config-qunar-rn',
    };
    if (!configFile) {
        const depend = extendList[args?.[0]?.slice(1)[0]] || extendList.base;
        const config = {
            extends: [depend, "plugin:diff/diff"],
        };
        packageJson.devDependencies[depend] = 'latest';

        // 将配置对象转换为字符串
        const configStr = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
        // 写入文件
        // fs.writeFile('.eslintrc.js', configStr, (err) => {
        //     if (err) {
        //         console.error(err);
        //     } else {
        //         console.log('.eslintrc.js 文件已创建');
        //     }
        // });
        try {
            fs.writeFileSync('.eslintrc.js', configStr);
            console.log('.eslintrc.js 文件创建成功');
        } catch (err) {
            console.error(`写入配置文件时发生错误: ${err}`);
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
