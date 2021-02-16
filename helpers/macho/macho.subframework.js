var SubFrameworkCommand = function SubFrameworkCommand(cmd, cmdsize, umbrella) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.umbrella = umbrella || 0x00000000;
};