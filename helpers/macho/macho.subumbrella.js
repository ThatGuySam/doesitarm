var SubUmbrellaCommand = function SubUmbrellaCommand(cmd, cmdsize, sub_umbrella) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.sub_umbrella = sub_umbrella || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};