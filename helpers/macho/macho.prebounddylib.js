var PreboundDylibCommand = function PreboundDylibCommand(cmd, cmdsize, name, nmodules, linked_modules) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.name = name || 0x00000000;
    this.nmodules = nmodules || 0x00000000;
    this.linked_modules = linked_modules || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};