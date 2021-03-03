var SubClientCommand = function SubClientCommand(cmd, cmdsize, client) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.client = client || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};