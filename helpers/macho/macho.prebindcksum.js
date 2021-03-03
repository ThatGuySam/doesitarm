var PrebindCksumCommand = function PrebindCksumCommand(cmd, cmdsize, cksum) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.cksum = cksum || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};