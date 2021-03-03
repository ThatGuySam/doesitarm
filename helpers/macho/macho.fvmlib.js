var Fvmlib = function Fvmlib(name, minor_version, header_addr) {
    this.name = name || 0x00000000;
    this.minor_version = minor_version || 0x00000000;
    this.header_addr = header_addr || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var FvmlibCommand = function FvmlibCommand(cmd, cmdsize, fvmlib) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.fvmlib = fvmlib || new Fvmlib(); //needs better input validation
    this.toString = function() {
        return JSON.stringify(this);
    };
};