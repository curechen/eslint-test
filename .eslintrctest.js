module.exports = {
    parserOptions: {
        ecmaVersion: 2021, // 根据你的项目需要选择适当的版本
    },

    // extends: ['@qnpm/eslint-config-qunar-base'],
    extends: [
        '@qnpm/eslint-config-qunar-base',
        // 这里是新添加的配置项！
        'plugin:diff/staged',
    ],
    rules: {
        // 这里的规则的值如果是字符串，则支持以下几个值
        // 'error'|2: 当你的语句没有分号结束时，则会报错提示，编译程序会退出
        // 'warn'|1: 当你的语句没有分号结束时，则会告警提示，不会导致程序退出
        // 'off'|0: 关闭这条规则
        semi: 'error',
    },
};
