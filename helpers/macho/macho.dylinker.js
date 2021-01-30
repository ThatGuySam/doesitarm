var DylinkerCommand = function DylinkerCommand(cmd, cmdsize) {
    this.cmd = 0x00000000;
    this.cmdsize = 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};