var TwoLevelHintsCommand  = function TwoLevelHintsCommand(cmd, cmdsize, offset, nhints) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.offset = offset || 0x00000000;
    this.nhints = nhints || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var TwoLevelHint = {
    isub_image:8,
    itoc:24,
    toString: function() {
        return JSON.stringify(this);
    }
};