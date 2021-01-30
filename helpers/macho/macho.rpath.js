var RpathCommand = function RpathCommand(cmd, cmdsize, path) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.path = path || 0x00000000;
    this.toString = function() {
        JSON.stringify(this);
    };
};