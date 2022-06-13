export const commandArguments = process.argv
export const cliOptions = {
    verbose: commandArguments.includes('--verbose'),

    withApi: commandArguments.includes('--with-api'),
    noLists: commandArguments.includes('--no-lists'),
    showMerges: commandArguments.includes('--show-merges'),
}
