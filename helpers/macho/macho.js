//macho.js
//Written by Sem Voigtländer
//Licensed under the MIT License

import { mime_binary } from './mimetypes.js'
import { ReadUint32, ReadUint16LE, ReadUint32LE, ReadUint16 } from './memory.js'

import { uint32_t, uint64_t } from './macho.constants.js'
import { MAGIC } from './macho.magic.js'
import { MachoHeader64, MachoHeader } from './macho.header.js'
import { LOAD_COMMAND_TYPE, LoadCommand } from './macho.loadcommand.js'
import { CPU_TYPE, CPU_SUB_TYPE } from './macho.cpu.js'
import { FILE_FLAGS, FILE_TYPE } from './macho.file.js'
import Cstr from './macho.cstr.js'
import { SegmentCommand } from './macho.segment.js'

function default_callback(buffer) {
    console.log('Received ' + buffer.byteLength / (1024 * 1024) + ' MB');
}

// https://stackoverflow.com/a/57139182/1397641
async function arrayBufferToBlob( buffer ) {
    return new Blob([buffer])
}

var ChunkReader = function ChunkReader(file, chunksize = (1024 * 1024), callback = default_callback) {

    if(file == undefined) {
        throw new Error('Invalid argument for file parameter.');
    }

    if(window.readers == undefined) { window.readers = []; } //Free list
    this.chunksize = chunksize; //Read a kilobyte at a time
    this.filesize = file.size;
    this.offset = 0;

    //Start reading the chunks
    while(this.offset + this.chunksize <= this.filesize) {

        this.blob = file.slice(this.offset, this.offset+this.chunksize);

        window.readers[window.readers.length] = new FileReader();
        window.readers[window.readers.length-1].onloadend = function(e) {
            callback(e.target.result);
        };
        window.readers[window.readers.length-1].readAsArrayBuffer(this.blob);
        console.log('Sending chunk from 0x'+this.offset.toString(16));
        this.offset+=this.chunksize;
    }

    for(obj = 0; obj < window.readers.length; obj++) {
        window.readers[obj] = undefined;
    }

    free("window.readers");
};

export function MachoParser(file, callback) {

    const machoOutputData = {}

    //properties
    this.reader = new FileReader();

    function writeToCallback(val) {
        return

        // if(callbackElement) {
        //     callbackElement.innerHTML +='<tr>'+val+'</tr>';
        // } else {
        //     throw new Error('Invalid callback.');
        // }
    }

    /*
		@Function FindMagic
		@Params (Uint8Array) buffer, (bool) breakwhenfound
		@Return (Array) offsets of found magics
	*/
    function FindMagic(data, breakwhenfound = false) {
        var results = [];
        for(var byte = 0; byte < (data.length - uint32_t); byte++) { //Read 32-bits at a time until the end of the buffer
            var magic = ReadUint32(data, byte); //Read the next 32-bit magic value
            if(MAGIC.VALIDATE(magic)) {
                results.push(byte);
                if(breakwhenfound) {
                    break;
                }
            }
        }
        return results;
    }


    /*
		@Function MapFlags
		@Params (Uint8Array)flags, (Object)map
		@Return (Object) key-value mapped dictionary
	*/
    function MapFlags(value, map) {
        var res = {};
        for (var bit = 1; (value < 0 || bit <= value) && bit !== 0; bit <<= 1)
		    if (value & bit) res[map[bit]] = true; //If value and the bit are equal then map the value to the result

        return res;
    }

    function ParseCommand(type, data, size, off) {
        var cmd = null;
        if(type == LOAD_COMMAND_TYPE.LC_SEGMENT) {
            if(data.length < 48) {
                if(window.verbose){console.log('Segment command OOB');}
                return new LoadCommand(type, data, size, off);
            }
            let name = new Cstr(data.slice(0, (4*uint32_t)));
            cmd = new SegmentCommand(
                type,
                size,
                name,
                ReadUint32(data, (4*uint32_t)),
                ReadUint32(data, (5*uint32_t)),
                ReadUint32(data, (6*uint32_t)),
                ReadUint32(data, (7*uint32_t)),
                ReadUint32(data, (8*uint32_t)),
                ReadUint32(data, (9*uint32_t)),
                ReadUint32(data, (10*uint32_t)),
                ReadUint32(data, (11*uint32_t))
            );

            function prot(p) {
                var res = {read: false, write: false, exec: false};
                return res;
            }

            let sectSize = 17 * uint32_t;
            var sections = [];
            //for(var i = 0, off = 48; i < nsects)
            return cmd;
        } else {
            return new LoadCommand(type, data, size, off);
        }
    }

    this.reader.onloadend = function(e) {

        let fileType = mime_binary;

        //Handle the file buffer and eventually create a Blob of the result
        // blobUtil.
        arrayBufferToBlob(e.target.result, fileType).then(function(blob) {

            let filesize =  ((blob.size / 1024) / 1024); //Calculate FileSize in Megabyte
            window.tempFile = blob;

            //Set up the file and print out for verbosity
            machoOutputData.file = file
            machoOutputData.fileSize = filesize
            machoOutputData.architectures = []
            // writeToCallback('<td><strong>File</strong></td><td>'+file.name.toString()+'</td>');
            // writeToCallback('<td><strong>Size</strong></td><td>' + filesize.toFixed(2).toString() + 'MB</td>');

            //Construct a new 8-bit array from the file buffer
            let data = new Uint8Array(e.target.result);
            let magics = FindMagic(data, false); //Try to find all Mach-O magics in the byte array

            if(window.debug) { console.log('Parsing all magics...'); }

            //If magics where found, parse the binary.
            if(magics.length > 0) {

                for(var cMagic = 0; cMagic < magics.length; cMagic++) { //Start parsing the binary from each found magic's offset

                    const architecture = {}

                    let magicOff = magics[cMagic]; //The offset of the magic currently being parsed
                    let magic = ReadUint32(data, magicOff); //Read the magic from the byte array
                    let littleendian = MAGIC.ISLITTLEENDIAN(magic); //Get the endianness of the magic
                    let x64 = MAGIC.IS64BIT(magic); //Check which bit architecture is being used

                    // machoOutputData = {}; //Create the Mach-O information object
                    architecture.bits = (x64 ? "64-bit" : "32-bit"); //Get the architecture
                    architecture.endianness = (littleendian ? "little endian" : "big endian"); //Get the endianness
                    architecture.header = (x64 ? new MachoHeader64() : new MachoHeader()); //Depending on architecture, construct a new header
                    architecture.header.magic = magic; //Add the magic to the header
                    architecture.header.cputype = (littleendian ? ReadUint16LE(data, magicOff+uint32_t) : ReadUint16(data, magicOff+uint32_t)); //Read the cputype which comes after the magic
                    architecture.header.cpusubtype = (littleendian ? ReadUint16LE(data, magicOff+(2*uint32_t)) : ReadUint16(data, magicOff+(2*uint32_t))); //Read the cpu subtype which comes after the cputype
                    architecture.header.filetype = (littleendian ? ReadUint32LE(data, magicOff+(3*uint32_t)) : ReadUint32(data, magicOff+(3*uint32_t))); //Read the file type which comes after the cpu subtype
                    architecture.header.ncmds = (littleendian ? ReadUint32LE(data, magicOff+(4*uint32_t)) : ReadUint32(data, magicOff+(4*uint32_t))); //Read the number of commands which comes after the filetype
	                architecture.header.sizeofcmds =(littleendian ? ReadUint32LE(data, magicOff+(5*uint32_t)) : ReadUint32(data, magicOff+(5*uint32_t))); //Read the size of the commands which comes after the number of commands
	                architecture.header.flags = (littleendian ? ReadUint32LE(data, magicOff+(6*uint32_t)) : ReadUint32(data, magicOff+(6*uint32_t))); //Read the flags which come after the size of the commands
	                architecture.loadcommands = [];

	                var align = (x64 ? uint64_t : uint32_t); //Depending on our architecture set an align for parsing the load commands

	                for(var i = 0, off = magicOff; off < data.length, i < architecture.header.ncmds; i++) {

	                	var curr_cmd = {};
	                	curr_cmd.cmd = (littleendian ? ReadUint32LE(data, off) : ReadUint32(data, off)); //Read the command type from the offset
	                	curr_cmd.cmdsize = (littleendian ? ReadUint32LE(data, off+align) : ReadUint32(data, off+align)); //Read the size of the command from the offset
	                	curr_cmd.fileoff = off; //Add the offset of the loadcommand for later use
	                	curr_cmd.data = data.slice(off, curr_cmd.cmdsize);

	                	curr_cmd = ParseCommand(curr_cmd.cmd, curr_cmd.data, curr_cmd.cmdsize, curr_cmd.fileoff);
	                	if(curr_cmd.cmdsize > 0) { //Commands with a size of zero are not valid or not interesting
	                		architecture.loadcommands.push(curr_cmd);
	                	}

	             		off+=8;

	                	i++; //Increate the loadcommand counter
                    }


                    architecture.offset = magicOff.toString(16)
                    architecture.magic = architecture.header.magic.toString(16)
                    architecture.processorType = CPU_TYPE.DESCRIPTION(architecture.header.cputype)
                    architecture.processorSubType = CPU_SUB_TYPE.ARM.DESCRIPTION(architecture.header.cpusubtype)
                    architecture.fileType = FILE_TYPE.DESCRIPTION(architecture.header.filetype)

	                /* Parse all collected information to Human Readable strings */
	                // writeToCallback('');
	                // writeToCallback('<td><strong>Header</strong></td>');
	                // writeToCallback('<td><strong>Offset</strong></td><td>0x'+magicOff.toString(16)+'</td>');
	                // writeToCallback('<td><strong>Magic</strong></td><td>0x'+architecture.header.magic.toString(16)+'</td>');
	                // writeToCallback('<td><strong>Bits</strong></td><td>'+architecture.bits+'</td>');
	                // writeToCallback('<td><strong>Endianness</strong></td><td>'+architecture.endianness+'</td>');
	                // writeToCallback('<td><strong>Processor type</strong></td><td>' + CPU_TYPE.DESCRIPTION(architecture.header.cputype)+'</td>');
	                // writeToCallback('<td><strong>Processor subtype</strong></td><td>'+ CPU_SUB_TYPE.ARM.DESCRIPTION(architecture.header.cpusubtype)+'</td>');
	                // writeToCallback('<td><strong>File type</strong></td><td>'+FILE_TYPE.DESCRIPTION(architecture.header.filetype)+'</td>');
	                // writeToCallback('<td><strong>Number of commands</strong></td><td>'+architecture.header.ncmds+'</td>');
	                // writeToCallback('<td><strong>Size of commands</strong></td><td>'+architecture.header.sizeofcmds+'</td>');

	               	architecture.header.flags = MapFlags(architecture.header.flags, FILE_FLAGS);
	               	architecture.header.flags = Object.keys(architecture.header.flags).map(function(k) { if(k){return k}});


	                // writeToCallback('<td><strong>Flags</strong></td><td>'+architecture.header.flags.toString().replace(',','<br>').replace(',','<br>')+"</td>");
                    // writeToCallback('');
                    // writeToCallback('<td><strong>Load Command</strong></td><td><strong>Size</strong></td><td><strong>Offset</strong></td>');

                    architecture.loadCommandsInfo = []

	                for(var curr_lc = 0; curr_lc < architecture.loadcommands.length; curr_lc++) {

                        architecture.loadCommandsInfo.push({
                            description: LOAD_COMMAND_TYPE.DESCRIPTION(architecture.loadcommands[curr_lc].cmd),
                            size: architecture.loadcommands[curr_lc].cmdsize,
                            offset: ` 0x${architecture.loadcommands[curr_lc].fileoff.toString(16)}`
                        })


	                	// writeToCallback(
	                	// 	'<td>'+
	                	// 		LOAD_COMMAND_TYPE.DESCRIPTION(architecture.loadcommands[curr_lc].cmd) +
	                	// 	'</td>'+
	                	// 	'<td>'+
	                	// 		architecture.loadcommands[curr_lc].cmdsize+
	                	// 	'</td>'+
	                	// 	'<td>'+
	                	// 		' 0x' +	architecture.loadcommands[curr_lc].fileoff.toString(16) +
	                	// 	'</td>');
                    }

	                magicOff = null;
	                littleendian = null;
	                x64 = null;


                    // blobUtil.
                    arrayBufferToBlob(data.buffer, fileType).then(function(blob){
	               			if(!window.tempFiles) { window.tempFiles = []; }
	               			window.tempFiles[window.tempFiles.length] = blob;
                    }).catch(console.log.bind(console));

                    machoOutputData.architectures.push( architecture )
                }

                callback( machoOutputData )

                console.log('The parser has finished')

            } else { //(magics.length <= 0) (If we end up here it means no magics were found in the file).
                // writeToCallback('This is not a valid Mach-O file.');

                throw new Error('This is not a valid Mach-O file.')
            }

        }).catch(console.log.bind(console));
    };

    this.reader.readAsArrayBuffer(file);

    console.log('Parsing, please wait...');

};



export default async function ( file ) {
    return new Promise( ( resolve, reject ) => {
        try {
            (new MachoParser( file, resolve ))
        } catch ( error ) {
            reject( error )
        }
    } )
}
