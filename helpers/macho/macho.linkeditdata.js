var LinkeditDataCommand = function LinkeditDataCommand(cmd, cmdsize, dataoff, datasize) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.dataoff = dataoff || 0x00000000;
    this.datasize = datasize || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};