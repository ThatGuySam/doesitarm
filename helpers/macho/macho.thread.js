var ThreadCommand = function ThreadCommand(cmd, cmdsize, name) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.name = name || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};