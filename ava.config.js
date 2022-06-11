export default () => {
    return {
        require: [
            'dotenv/config',
            'esm',
            'tsconfig-paths/register'
        ],
        // https://github.com/avajs/ava/blob/main/docs/recipes/watch-mode.md
        ignoredByWatcher: [
            '!**/*.{js,vue}',
            './build',
            './dist',
            './.output',
        ],
        // tap: true,
        // verbose: true,
        color: true
    }
}
