/*

JS GameBoy Emulator v.1.0
Copyright (C) 2013 Alejandro Aladrén <alex@alexaladren.net> 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

 */

var Z80 = (module.exports = function(foreign) {
  "use asm";

  var getAddress = foreign.getAddress;
  var putAddress = foreign.putAddress;
  var executeInt = foreign.executeInt;

  var PC = foreign.start | 0;
  var RA = 1;
  var RB = 0;
  var RC = 0x13;
  var RD = 0;
  var RE = 0xd8;
  var RHL = 0x014d;
  var RSP = 0xfffe;

  var FZ = 0;
  var FN = 0;
  var FH = 0;
  var FC = 0;

  var IME = 0;
  var stopped = 0;

  function stop() {
    stopped = 1;
  }

  function resume() {
    stopped = 0;
  }

  function interrupt(address) {
    address = address | 0;
    if (IME) {
      //foreign.log("Interrupcion", address);
      IME = 0;
      call(address);
      resume();
      return 1;
    }
    return 0;
  }

  function getAddress16(address) {
    address = address | 0;
    return (
      (((getAddress((address + 1) | 0) | 0) << 8) +
        (getAddress(address | 0) | 0)) |
      0
    );
  }

  function putAddress16(address, data) {
    address = address | 0;
    data = data | 0;
    putAddress((address + 1) | 0, ((data >>> 0) / (256 >>> 0)) | 0);
    putAddress(address | 0, (data >>> 0) % (256 >>> 0) | 0);
  }

  function immediate16() {
    return (
      (((getAddress((PC + 1) | 0) | 0) << 8) + (getAddress(PC | 0) | 0)) | 0
    );
  }

  function immediate8() {
    return getAddress(PC | 0) | 0;
  }

  function signImmediate8() {
    var val = 0;
    val = getAddress(PC | 0) | 0;
    if ((val | 0) >= 128) {
      return ((val | 0) - 256) | 0;
    }
    return val | 0;
  }

  function increment8(a) {
    a = a | 0;
    FN = 0;
    FH = 0;
    if ((a | 0) >= 255) {
      FZ = 1;
      FH = 1;
      return 0;
    }
    FZ = 0;
    if (((a | 0) % 16 | 0) == 15) {
      FH = 1;
    }
    return (a + 1) | 0;
  }

  function decrement8(a) {
    a = a | 0;
    FN = 1;
    FH = 0;
    if ((a | 0) == 0) {
      FZ = 0;
      FH = 1;
      return 255;
    } else if ((a | 0) == 1) {
      FZ = 1;
      return 0;
    }
    FZ = 0;
    if (((a | 0) % 16 | 0) == 0) {
      FH = 1;
    }
    return (a - 1) | 0;
  }

  function add8(a, b) {
    a = a | 0;
    b = b | 0;
    FN = 0;
    if (((a + b) | 0) >= 256) {
      FC = 1;
    } else {
      FC = 0;
    }
    if ((((a + b) | 0) % 256 | 0) == 0) {
      FZ = 1;
    } else {
      FZ = 0;
    }
    if (((((a | 0) % 16 | 0) + ((b | 0) % 16 | 0)) | 0) >= 16) {
      FH = 1;
    } else {
      FH = 0;
    }
    return ((a + b) | 0) % 256 | 0;
  }

  function adc8(a, b) {
    a = a | 0;
    b = b | 0;
    if (FC) {
      return add8(a, (b + 1) | 0) | 0;
    }
    return add8(a, b) | 0;
  }

  function add16(a, b) {
    a = a | 0;
    b = b | 0;
    if ((b | 0) < 0) b = (b + 65536) | 0;
    FN = 0;
    if (((a + b) | 0) >= 65536) {
      FC = 1;
    } else {
      FC = 0;
    }
    if (((((a | 0) % 4096 | 0) + ((b | 0) % 4096 | 0)) | 0) >= 4096) {
      FH = 1;
    } else {
      FH = 0;
    }
    return ((a + b) | 0) % 65536 | 0;
  }

  function sub8(a, b) {
    a = a | 0;
    b = b | 0;
    FN = 1;
    if (((a - b) | 0) < 0) {
      FC = 1;
    } else {
      FC = 0;
    }
    if (((a - b) | 0) == 0) {
      FZ = 1;
    } else {
      FZ = 0;
    }
    if (((((a | 0) % 16 | 0) - ((b | 0) % 16 | 0)) | 0) < 0) {
      FH = 1;
    } else {
      FH = 0;
    }
    return ((a - b + 256) | 0) % 256 | 0;
  }

  function sbc8(a, b) {
    a = a | 0;
    b = b | 0;
    if (FC) {
      return sub8(a, (b + 1) | 0) | 0;
    }
    return sub8(a, b) | 0;
  }

  function and8(a, b) {
    a = a | 0;
    b = b | 0;
    FN = 0;
    FH = 1;
    FC = 0;
    if (((a & b) | 0) == 0) {
      FZ = 1;
    } else {
      FZ = 0;
    }
    return a & b;
  }

  function xor8(a, b) {
    a = a | 0;
    b = b | 0;
    FN = 0;
    FH = 0;
    FC = 0;
    if (((a ^ b) | 0) == 0) {
      FZ = 1;
    } else {
      FZ = 0;
    }
    return a ^ b;
  }

  function or8(a, b) {
    a = a | 0;
    b = b | 0;
    FN = 0;
    FH = 0;
    FC = 0;
    if ((a | b | 0) == 0) {
      FZ = 1;
    } else {
      FZ = 0;
    }
    return a | b;
  }

  function call(address) {
    //foreign.log("Llamada a", address,"desde",PC);
    address = address | 0;
    RSP = (RSP - 2) | 0;
    putAddress16(RSP, PC);
    PC = address;
    RSP = ((RSP + 0x10000) | 0) % 0x10000 | 0;
  }

  function ret() {
    PC = getAddress16(RSP) | 0;
    //console.log("Retorno", PC);
    RSP = (RSP + 2) | 0;
    RSP = (RSP | 0) % 0x10000 | 0;
  }

  function setH(val) {
    val = val | 0;
    RHL = (RHL & 0xff) | (val << 8);
  }

  function setL(val) {
    val = val | 0;
    RHL = (RHL & 0xff00) | val;
  }

  // http://www.pastraiser.com/cpu/gameboy/gameboy_opcodes.html
  // 00 - NOP
  function inst00() {
    PC = (PC + 1) | 0;
    return 4;
  }
  // 01 - LD BC,d16
  function inst01() {
    var data = 0;
    PC = (PC + 1) | 0;
    data = immediate16() | 0;
    RB = data >> 8;
    RC = data & 0xff;
    PC = (PC + 2) | 0;
    return 12;
  }
  // 02 - LD (BC),A
  function inst02() {
    putAddress((RB << 8) | RC, RA | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 03 - INC BC
  function inst03() {
    RC = (RC + 1) | 0;
    if ((RC | 0) == 256) {
      RC = 0;
      RB = (RB + 1) | 0;
      if ((RB | 0) == 256) RB = 0;
    }
    PC = (PC + 1) | 0;
    return 8;
  }
  // 04 - INC B
  function inst04() {
    RB = increment8(RB) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 05 - DEC B
  function inst05() {
    RB = decrement8(RB) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 06 - LD B,d8
  function inst06() {
    PC = (PC + 1) | 0;
    RB = immediate8() | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 07 - RLCA
  function inst07() {
    PC = (PC + 1) | 0;
    cbinstruction(7);
    return 4;
  }
  // 08 - LD (a16),SP
  function inst08() {
    PC = (PC + 1) | 0;
    putAddress16(immediate16() | 0, RSP);
    PC = (PC + 2) | 0;
    return 20;
  }
  // 09 - ADD HL,BC
  function inst09() {
    RHL = add16(RHL, (RB << 8) | RC) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 0A - LD A,(BC)
  function inst0A() {
    RA = getAddress((RB << 8) | RC) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 0B - DEC BC
  function inst0B() {
    RC = (RC - 1) | 0;
    if ((RC | 0) == -1) {
      RC = 255;
      RB = (RB - 1) | 0;
      if ((RB | 0) == -1) RB = 255;
    }
    PC = (PC + 1) | 0;
    return 8;
  }
  // 0C - INC C
  function inst0C() {
    RC = increment8(RC) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 0D - DEC C
  function inst0D() {
    RC = decrement8(RC) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 0E - LD C,d8
  function inst0E() {
    PC = (PC + 1) | 0;
    RC = immediate8() | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 0F - RRCA
  function inst0F() {
    PC = (PC + 1) | 0;
    cbinstruction(15);
    return 4;
  }
  // 10 - STOP
  function inst10() {
    stop();
    PC = (PC + 1) | 0;
    return 4;
  }
  // 11 - LD DE,d16
  function inst11() {
    var data = 0;
    PC = (PC + 1) | 0;
    data = immediate16() | 0;
    RD = data >> 8;
    RE = data & 0xff;
    PC = (PC + 2) | 0;
    return 12;
  }
  // 12 - LD (DE),A
  function inst12() {
    putAddress((RD << 8) | RE, RA | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 13 - INC DE
  function inst13() {
    RE = (RE + 1) | 0;
    if ((RE | 0) == 256) {
      RE = 0;
      RD = (RD + 1) | 0;
      if ((RD | 0) == 256) RD = 0;
    }
    PC = (PC + 1) | 0;
    return 8;
  }
  // 14 - INC D
  function inst14() {
    RD = increment8(RD) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 15 - DEC D
  function inst15() {
    RD = decrement8(RD) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 16 - LD D,d8
  function inst16() {
    PC = (PC + 1) | 0;
    RD = immediate8() | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 17 - RLA
  function inst17() {
    PC = (PC + 1) | 0;
    cbinstruction(23);
    return 4;
  }
  // 18 - JR r8
  function inst18() {
    PC = (PC + 1) | 0;
    PC = (PC + (signImmediate8() | 0) + 1) | 0;
    return 12;
  }
  // 19 - ADD HL,DE
  function inst19() {
    RHL = add16(RHL, (RD << 8) | RE) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 1A - LD A,(DE)
  function inst1A() {
    RA = getAddress((RD << 8) | RE) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 1B - DEC DE
  function inst1B() {
    RE = (RE - 1) | 0;
    if ((RE | 0) == -1) {
      RE = 255;
      RD = (RD - 1) | 0;
      if ((RD | 0) == -1) RD = 255;
    }
    PC = (PC + 1) | 0;
    return 8;
  }
  // 1C - INC E
  function inst1C() {
    RE = increment8(RE) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 1D - DEC E
  function inst1D() {
    RE = decrement8(RE) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 1E - LD E,d8
  function inst1E() {
    PC = (PC + 1) | 0;
    RE = immediate8() | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 1F - RRA
  function inst1F() {
    PC = (PC + 1) | 0;
    cbinstruction(31);
    return 4;
  }
  // 20 - JR NZ,r8
  function inst20() {
    if (!FZ) {
      PC = (PC + 1) | 0;
      PC = (PC + (signImmediate8() | 0) + 1) | 0;
      return 12;
    }
    PC = (PC + 2) | 0;
    return 8;
  }
  // 21 - LD HL,d16
  function inst21() {
    PC = (PC + 1) | 0;
    RHL = immediate16() | 0;
    PC = (PC + 2) | 0;
    return 12;
  }
  // 22 - LD (HL+),A
  function inst22() {
    putAddress(RHL | 0, RA | 0);
    RHL = (RHL + 1) | 0;
    if ((RHL | 0) > 0xffff) RHL = 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 23 - INC HL
  function inst23() {
    RHL = (RHL + 1) | 0;
    if ((RHL | 0) > 0xffff) RHL = 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 24 - INC H
  function inst24() {
    setH(increment8(RHL >> 8) | 0);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 25 - DEC H
  function inst25() {
    setH(decrement8(RHL >> 8) | 0);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 26 - LD H,d8
  function inst26() {
    PC = (PC + 1) | 0;
    setH(immediate8() | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 27 - DAA
  function inst27() {
    var upper = 0;
    var lower = 0;
    PC = (PC + 1) | 0;
    upper = RA >> 4;
    lower = (RA | 0) % 16 | 0;
    if (!FN) {
      if (!FC & !FH & ((upper | 0) <= 9) & ((lower | 0) <= 9)) {
        FC = 0;
      } else if (!FC & !FH & ((upper | 0) <= 8) & ((lower | 0) >= 10)) {
        FC = 0;
        RA = (RA + 0x06) | 0;
      } else if (!FC & FH & ((upper | 0) <= 9) & ((lower | 0) <= 3)) {
        FC = 0;
        RA = (RA + 0x06) | 0;
      } else if (!FC & !FH & ((upper | 0) >= 10) & ((lower | 0) <= 9)) {
        FC = 1;
        RA = (RA + 0x60) | 0;
      } else if (!FC & !FH & ((upper | 0) >= 9) & ((lower | 0) >= 10)) {
        FC = 1;
        RA = (RA + 0x66) | 0;
      } else if (!FC & FH & ((upper | 0) >= 10) & ((lower | 0) <= 3)) {
        FC = 1;
        RA = (RA + 0x66) | 0;
      } else if (FC & !FH & ((upper | 0) <= 2) & ((lower | 0) <= 9)) {
        FC = 1;
        RA = (RA + 0x60) | 0;
      } else if (FC & !FH & ((upper | 0) <= 2) & ((lower | 0) >= 10)) {
        FC = 1;
        RA = (RA + 0x66) | 0;
      } else if (FC & FH & ((upper | 0) <= 3) & ((lower | 0) <= 3)) {
        FC = 1;
        RA = (RA + 0x66) | 0;
      }
    } else {
      if (!FC & !FH & ((upper | 0) <= 9) & ((lower | 0) <= 9)) {
        FC = 0;
      } else if (!FC & FH & ((upper | 0) <= 8) & ((lower | 0) >= 6)) {
        FC = 0;
        RA = (RA + 0xfa) | 0;
      } else if (FC & !FH & ((upper | 0) >= 7) & ((lower | 0) <= 9)) {
        FC = 1;
        RA = (RA + 0xa0) | 0;
      } else if (FC & FH & ((upper | 0) >= 6) & ((lower | 0) >= 6)) {
        FC = 1;
        RA = (RA + 0x9a) | 0;
      }
    }
    RA = (RA | 0) % 256 | 0;
    return 4;
  }
  // 28 - JR Z,r8
  function inst28() {
    if (FZ) {
      PC = (PC + 1) | 0;
      PC = (PC + (signImmediate8() | 0) + 1) | 0;
      return 12;
    }
    PC = (PC + 2) | 0;
    return 8;
  }
  // 29 - ADD HL,HL
  function inst29() {
    RHL = add16(RHL, RHL) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 2A - LD A,(HL+)
  function inst2A() {
    RA = getAddress(RHL | 0) | 0;
    RHL = (RHL + 1) | 0;
    if ((RHL | 0) > 0xffff) RHL = 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 2B - DEC HL
  function inst2B() {
    RHL = (RHL - 1) | 0;
    if ((RHL | 0) < 0) RHL = 0xffff;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 2C - INC L
  function inst2C() {
    setL(increment8(RHL & 0xff) | 0);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 2D - DEC L
  function inst2D() {
    setL(decrement8(RHL & 0xff) | 0);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 2E - LD L,d8
  function inst2E() {
    PC = (PC + 1) | 0;
    setL(immediate8() | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 2F - CPL
  function inst2F() {
    RA = RA ^ 255;
    FN = 1;
    FH = 1;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 30 - JR NC,r8
  function inst30() {
    if (!FC) {
      PC = (PC + 1) | 0;
      PC = (PC + (signImmediate8() | 0) + 1) | 0;
      return 12;
    }
    PC = (PC + 2) | 0;
    return 8;
  }
  // 31 - LD SP,d16
  function inst31() {
    PC = (PC + 1) | 0;
    RSP = immediate16() | 0;
    PC = (PC + 2) | 0;
    return 12;
  }
  // 32 - LD (HL-),A
  function inst32() {
    putAddress(RHL | 0, RA | 0);
    RHL = (RHL - 1) | 0;
    if ((RHL | 0) < 0) RHL = 0xffff;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 33 - INC SP
  function inst33() {
    RSP = (RSP + 1) | 0;
    if ((RSP | 0) > 0xffff) RSP = 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 34 - INC (HL)
  function inst34() {
    putAddress(RHL | 0, increment8(getAddress(RHL | 0) | 0) | 0);
    PC = (PC + 1) | 0;
    return 12;
  }
  // 35 - DEC (HL)
  function inst35() {
    putAddress(RHL | 0, decrement8(getAddress(RHL | 0) | 0) | 0);
    PC = (PC + 1) | 0;
    return 12;
  }
  // 36 - LD (HL),d8
  function inst36() {
    PC = (PC + 1) | 0;
    putAddress(RHL | 0, immediate8() | 0);
    PC = (PC + 1) | 0;
    return 12;
  }
  // 37 - SCF
  function inst37() {
    FC = 1;
    FN = 0;
    FH = 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 38 - JR C,r8
  function inst38() {
    if (FC) {
      PC = (PC + 1) | 0;
      PC = (PC + (signImmediate8() | 0) + 1) | 0;
      return 12;
    }
    PC = (PC + 2) | 0;
    return 8;
  }
  // 39 - ADD HL,SP
  function inst39() {
    RHL = add16(RHL | 0, RSP | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 3A - LD A,(HL-)
  function inst3A() {
    RA = getAddress(RHL | 0) | 0;
    RHL = (RHL - 1) | 0;
    if ((RHL | 0) < 0) RHL = 0xffff;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 3B - DEC SP
  function inst3B() {
    RSP = (RSP - 1) | 0;
    if ((RSP | 0) < 0) RSP = 0xffff;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 3C - INC A
  function inst3C() {
    RA = increment8(RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 3D - DEC L
  function inst3D() {
    RA = decrement8(RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 3E - LD A,d8
  function inst3E() {
    PC = (PC + 1) | 0;
    RA = immediate8() | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 3F - CCF
  function inst3F() {
    if (FC) FC = 0;
    else FC = 1;
    FN = 0;
    FH = 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 40 - LD B,B
  function inst40() {
    RB = RB;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 41 - LD B,C
  function inst41() {
    RB = RC;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 42 - LD B,D
  function inst42() {
    RB = RD;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 43 - LD B,E
  function inst43() {
    RB = RE;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 44 - LD B,H
  function inst44() {
    RB = RHL >> 8;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 45 - LD B,L
  function inst45() {
    RB = RHL & 0xff;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 46 - LD B,(HL)
  function inst46() {
    RB = getAddress(RHL | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 47 - LD B,A
  function inst47() {
    RB = RA;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 48 - LD C,B
  function inst48() {
    RC = RB;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 49 - LD C,C
  function inst49() {
    RC = RC;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 4A - LD C,D
  function inst4A() {
    RC = RD;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 4B - LD C,E
  function inst4B() {
    RC = RE;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 4C - LD C,H
  function inst4C() {
    RC = RHL >> 8;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 4D - LD C,L
  function inst4D() {
    RC = RHL & 0xff;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 4E - LD C,(HL)
  function inst4E() {
    RC = getAddress(RHL | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 4F - LD C,A
  function inst4F() {
    RC = RA;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 50 - LD D,B
  function inst50() {
    RD = RB;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 51 - LD D,C
  function inst51() {
    RD = RC;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 52 - LD D,D
  function inst52() {
    RD = RD;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 53 - LD D,E
  function inst53() {
    RD = RE;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 54 - LD D,H
  function inst54() {
    RD = RHL >> 8;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 55 - LD D,L
  function inst55() {
    RD = RHL & 0xff;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 56 - LD D,(HL)
  function inst56() {
    RD = getAddress(RHL | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 57 - LD D,A
  function inst57() {
    RD = RA;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 58 - LD E,B
  function inst58() {
    RE = RB;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 59 - LD E,C
  function inst59() {
    RE = RC;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 5A - LD E,D
  function inst5A() {
    RE = RD;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 5B - LD E,E
  function inst5B() {
    RE = RE;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 5C - LD E,H
  function inst5C() {
    RE = RHL >> 8;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 5D - LD E,L
  function inst5D() {
    RE = RHL & 0xff;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 5E - LD E,(HL)
  function inst5E() {
    RE = getAddress(RHL | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 5F - LD E,A
  function inst5F() {
    RE = RA;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 60 - LD H,B
  function inst60() {
    setH(RB);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 61 - LD H,C
  function inst61() {
    setH(RC);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 62 - LD H,D
  function inst62() {
    setH(RD);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 63 - LD H,E
  function inst63() {
    setH(RE);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 64 - LD H,H
  function inst64() {
    setH(RHL >> 8);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 65 - LD H,L
  function inst65() {
    setH(RHL & 0xff);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 66 - LD H,(HL)
  function inst66() {
    setH(getAddress(RHL | 0) | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 67 - LD H,A
  function inst67() {
    setH(RA);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 68 - LD L,B
  function inst68() {
    setL(RB);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 69 - LD L,C
  function inst69() {
    setL(RC);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 6A - LD L,D
  function inst6A() {
    setL(RD);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 6B - LD L,E
  function inst6B() {
    setL(RE);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 6C - LD L,H
  function inst6C() {
    setL(RHL >> 8);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 6D - LD L,L
  function inst6D() {
    setL(RHL & 0xff);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 6E - LD L,(HL)
  function inst6E() {
    setL(getAddress(RHL | 0) | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 6F - LD L,A
  function inst6F() {
    setL(RA);
    PC = (PC + 1) | 0;
    return 4;
  }
  // 70 - LD (HL),B
  function inst70() {
    putAddress(RHL | 0, RB | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 71 - LD (HL),C
  function inst71() {
    putAddress(RHL | 0, RC | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 72 - LD (HL),D
  function inst72() {
    putAddress(RHL | 0, RD | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 73 - LD (HL),E
  function inst73() {
    putAddress(RHL | 0, RE | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 74 - LD (HL),H
  function inst74() {
    putAddress(RHL | 0, RHL >> 8);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 75 - LD (HL),L
  function inst75() {
    putAddress(RHL | 0, RHL & 0xff);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 76 - HALT
  function inst76() {
    if ((IME | 0) == 1) stop();
    PC = (PC + 1) | 0;
    return 4;
  }
  // 77 - LD (HL),A
  function inst77() {
    putAddress(RHL | 0, RA | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // 78 - LD A,B
  function inst78() {
    RA = RB;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 79 - LD A,C
  function inst79() {
    RA = RC;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 7A - LD A,D
  function inst7A() {
    RA = RD;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 7B - LD A,E
  function inst7B() {
    RA = RE;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 7C - LD A,H
  function inst7C() {
    RA = RHL >> 8;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 7D - LD A,L
  function inst7D() {
    RA = RHL & 0xff;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 7E - LD A,(HL)
  function inst7E() {
    RA = getAddress(RHL | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 7F - LD A,A
  function inst7F() {
    RA = RA;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 80 - ADD A,B
  function inst80() {
    RA = add8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 81 - ADD A,C
  function inst81() {
    RA = add8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 82 - ADD A,D
  function inst82() {
    RA = add8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 83 - ADD A,E
  function inst83() {
    RA = add8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 84 - ADD A,H
  function inst84() {
    RA = add8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 85 - ADD A,L
  function inst85() {
    RA = add8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 86 - ADD A,(HL)
  function inst86() {
    RA = add8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 87 - ADD A,A
  function inst87() {
    RA = add8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 88 - ADC A,B
  function inst88() {
    RA = adc8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 89 - ADC A,C
  function inst89() {
    RA = adc8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 8A - ADC A,D
  function inst8A() {
    RA = adc8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 8B - ADC A,E
  function inst8B() {
    RA = adc8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 8C - ADC A,H
  function inst8C() {
    RA = adc8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 8D - ADC A,L
  function inst8D() {
    RA = adc8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 8E - ADC A,(HL)
  function inst8E() {
    RA = adc8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 8F - ADC A,A
  function inst8F() {
    RA = adc8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 90 - SUB B
  function inst90() {
    RA = sub8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 91 - SUB C
  function inst91() {
    RA = sub8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 92 - SUB D
  function inst92() {
    RA = sub8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 93 - SUB E
  function inst93() {
    RA = sub8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 94 - SUB H
  function inst94() {
    RA = sub8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 95 - SUB L
  function inst95() {
    RA = sub8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 96 - SUB (HL)
  function inst96() {
    RA = sub8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 97 - SUB A
  function inst97() {
    RA = sub8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 98 - SBC A,B
  function inst98() {
    RA = sbc8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 99 - SBC A,C
  function inst99() {
    RA = sbc8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 9A - SBC A,D
  function inst9A() {
    RA = sbc8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 9B - SBC A,E
  function inst9B() {
    RA = sbc8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 9C - SBC A,H
  function inst9C() {
    RA = sbc8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 9D - SBC A,L
  function inst9D() {
    RA = sbc8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // 9E - SBC A,(HL)
  function inst9E() {
    RA = sbc8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // 9F - SBC A,A
  function inst9F() {
    RA = sbc8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A0 - AND B
  function instA0() {
    RA = and8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A1 - AND C
  function instA1() {
    RA = and8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A2 - AND D
  function instA2() {
    RA = and8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A3 - AND E
  function instA3() {
    RA = and8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A4 - AND H
  function instA4() {
    RA = and8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A5 - AND L
  function instA5() {
    RA = and8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A6 - AND (HL)
  function instA6() {
    RA = and8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // A7 - AND A
  function instA7() {
    RA = and8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A8 - XOR B
  function instA8() {
    RA = xor8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // A9 - XOR C
  function instA9() {
    RA = xor8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // AA - XOR D
  function instAA() {
    RA = xor8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // AB - XOR E
  function instAB() {
    RA = xor8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // AC - XOR H
  function instAC() {
    RA = xor8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // AD - XOR L
  function instAD() {
    RA = xor8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // AE - XOR (HL)
  function instAE() {
    RA = xor8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // AF - XOR A
  function instAF() {
    RA = xor8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B0 - OR B
  function instB0() {
    RA = or8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B1 - OR C
  function instB1() {
    RA = or8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B2 - OR D
  function instB2() {
    RA = or8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B3 - OR E
  function instB3() {
    RA = or8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B4 - OR H
  function instB4() {
    RA = or8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B5 - OR L
  function instB5() {
    RA = or8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B6 - OR (HL)
  function instB6() {
    RA = or8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // B7 - OR A
  function instB7() {
    RA = or8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B8 - CP B
  function instB8() {
    sub8(RA | 0, RB | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // B9 - CP C
  function instB9() {
    sub8(RA | 0, RC | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // BA - CP D
  function instBA() {
    sub8(RA | 0, RD | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // BB - CP E
  function instBB() {
    sub8(RA | 0, RE | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // BC - CP H
  function instBC() {
    sub8(RA | 0, RHL >> 8) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // BD - CP L
  function instBD() {
    sub8(RA | 0, RHL & 0xff) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // BE - CP (HL)
  function instBE() {
    sub8(RA | 0, getAddress(RHL | 0) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // BF - CP A
  function instBF() {
    sub8(RA | 0, RA | 0) | 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // C0 - RET NZ
  function instC0() {
    if (!FZ) {
      ret();
      return 20;
    } else PC = (PC + 1) | 0;
    return 8;
  }
  // C1 - POP BC
  function instC1() {
    var data = 0;
    data = getAddress16(RSP | 0) | 0;
    RB = data >> 8;
    RC = data & 0xff;
    RSP = (RSP + 2) | 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // C2 - JP NZ,a16
  function instC2() {
    if (!FZ) {
      PC = (PC + 1) | 0;
      PC = immediate16() | 0;
      return 16;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // C3 - JP a16
  function instC3() {
    PC = (PC + 1) | 0;
    PC = immediate16() | 0;
    return 16;
  }
  // C4 - CALL NZ,a16
  function instC4() {
    var ad = 0;
    if (!FZ) {
      PC = (PC + 1) | 0;
      ad = immediate16() | 0;
      PC = (PC + 2) | 0;
      call(ad);
      return 24;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // C5 - PUSH BC
  function instC5() {
    RSP = (RSP - 2) | 0;
    putAddress16(RSP | 0, (RB << 8) | RC);
    PC = (PC + 1) | 0;
    return 16;
  }
  // C6 - ADD A,d8
  function instC6() {
    PC = (PC + 1) | 0;
    RA = add8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // C7 - RST 00H
  function instC7() {
    PC = (PC + 1) | 0;
    call(0);
    return 16;
  }
  // C8 - RET Z
  function instC8() {
    if (FZ) {
      ret();
      return 20;
    } else PC = (PC + 1) | 0;
    return 8;
  }
  // C9 - RET
  function instC9() {
    ret();
    return 16;
  }
  // CA - JP Z,a16
  function instCA() {
    if (FZ) {
      PC = (PC + 1) | 0;
      PC = immediate16() | 0;
      return 16;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // CB - PREFIX CB
  function instCB() {
    PC = (PC + 1) | 0;
    cbinstruction(immediate8() | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // CC - CALL Z,a16
  function instCC() {
    var ad = 0;
    if (FZ) {
      PC = (PC + 1) | 0;
      ad = immediate16() | 0;
      PC = (PC + 2) | 0;
      call(ad);
      return 24;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // CD - CALL a16
  function instCD() {
    var ad = 0;
    PC = (PC + 1) | 0;
    ad = immediate16() | 0;
    PC = (PC + 2) | 0;
    call(ad);
    return 24;
  }
  // CE - ADC A,d8
  function instCE() {
    PC = (PC + 1) | 0;
    RA = adc8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // CF - RST 08H
  function instCF() {
    PC = (PC + 1) | 0;
    call(8);
    return 16;
  }
  // D0 - RET NC
  function instD0() {
    if (!FC) {
      ret();
      return 20;
    } else PC = (PC + 1) | 0;
    return 8;
  }
  // D1 - POP DE
  function instD1() {
    var data = 0;
    data = getAddress16(RSP | 0) | 0;
    RD = data >> 8;
    RE = data & 0xff;
    RSP = (RSP + 2) | 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // D2 - JP NC,a16
  function instD2() {
    if (!FC) {
      PC = (PC + 1) | 0;
      PC = immediate16() | 0;
      return 16;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // D3 -
  function instD3() {
    return 0;
  }
  // D4 - CALL NC,a16
  function instD4() {
    var ad = 0;
    if (!FC) {
      PC = (PC + 1) | 0;
      ad = immediate16() | 0;
      PC = (PC + 2) | 0;
      call(ad);
      return 24;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // D5 - PUSH DE
  function instD5() {
    RSP = (RSP - 2) | 0;
    putAddress16(RSP | 0, (RD << 8) | RE);
    PC = (PC + 1) | 0;
    return 16;
  }
  // D6 - SUB d8
  function instD6() {
    PC = (PC + 1) | 0;
    RA = sub8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // D7 - RST 10H
  function instD7() {
    PC = (PC + 1) | 0;
    call(16);
    return 16;
  }
  // D8 - RET C
  function instD8() {
    if (FC) {
      ret();
      return 20;
    } else PC = (PC + 1) | 0;
    return 8;
  }
  // D9 - RETI
  function instD9() {
    IME = 1;
    ret();
    return 16;
  }
  // DA - JP C,a16
  function instDA() {
    if (FC) {
      PC = (PC + 1) | 0;
      PC = immediate16() | 0;
      return 16;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // DB -
  function instDB() {
    return 0;
  }
  // DC - CALL C,a16
  function instDC() {
    var ad = 0;
    if (FC) {
      PC = (PC + 1) | 0;
      ad = immediate16() | 0;
      PC = (PC + 2) | 0;
      call(ad);
      return 24;
    }
    PC = (PC + 3) | 0;
    return 12;
  }
  // DD -
  function instDD() {
    return 0;
  }
  // DE - SBC A,d8
  function instDE() {
    PC = (PC + 1) | 0;
    RA = sbc8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // DF - RST 18H
  function instDF() {
    PC = (PC + 1) | 0;
    call(24);
    return 16;
  }
  // E0 - LDH (a8),A
  function instE0() {
    PC = (PC + 1) | 0;
    putAddress(((255 << 8) + (immediate8() | 0)) | 0, RA | 0);
    PC = (PC + 1) | 0;
    return 12;
  }
  // E1 - POP HL
  function instE1() {
    RHL = getAddress16(RSP | 0) | 0;
    RSP = (RSP + 2) | 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // E2 - LD (C),A
  function instE2() {
    putAddress(((255 << 8) + RC) | 0, RA | 0);
    PC = (PC + 1) | 0;
    return 8;
  }
  // E3 -
  function instE3() {
    return 0;
  }
  // E4 -
  function instE4() {
    return 0;
  }
  // E5 - PUSH HL
  function instE5() {
    RSP = (RSP - 2) | 0;
    putAddress16(RSP | 0, RHL | 0);
    PC = (PC + 1) | 0;
    return 16;
  }
  // E6 - AND d8
  function instE6() {
    PC = (PC + 1) | 0;
    RA = and8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // E7 - RST 20H
  function instE7() {
    PC = (PC + 1) | 0;
    call(32);
    return 16;
  }
  // E8 - ADD SP,r8
  function instE8() {
    PC = (PC + 1) | 0;
    RSP = add16(RSP | 0, signImmediate8() | 0) | 0;
    FZ = 0;
    PC = (PC + 1) | 0;
    return 16;
  }
  // E9 - JP (HL)
  function instE9() {
    PC = RHL;
    return 4;
  }
  // EA - LD (a16),A
  function instEA() {
    PC = (PC + 1) | 0;
    putAddress(immediate16() | 0, RA | 0) | 0;
    PC = (PC + 2) | 0;
    return 16;
  }
  // EB -
  function instEB() {
    return 0;
  }
  // EC -
  function instEC() {
    return 0;
  }
  // ED -
  function instED() {
    return 0;
  }
  // EE - XOR A,d8
  function instEE() {
    PC = (PC + 1) | 0;
    RA = xor8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // EF - RST 28H
  function instEF() {
    PC = (PC + 1) | 0;
    call(40);
    return 16;
  }
  // F0 - LDH A,(a8)
  function instF0() {
    PC = (PC + 1) | 0;
    RA = getAddress((0xff00 + (immediate8() | 0)) | 0) | 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // F1 - POP AF
  function instF1() {
    var data = 0;
    data = getAddress16(RSP | 0) | 0;
    RA = data >> 8;
    FZ = ((data & 0x80) / 0x80) | 0;
    FN = ((data & 0x40) / 0x40) | 0;
    FH = ((data & 0x20) / 0x20) | 0;
    FC = ((data & 0x10) / 0x10) | 0;
    RSP = (RSP + 2) | 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // F2 - LD A,(C)
  function instF2() {
    RA = getAddress((0xff00 + RC) | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // F3 - DI
  function instF3() {
    IME = 0;
    PC = (PC + 1) | 0;
    return 4;
  }
  // F4 -
  function instF4() {
    return 0;
  }
  // F5 - PUSH AF
  function instF5() {
    RSP = (RSP - 2) | 0;
    putAddress16(
      RSP | 0,
      (RA << 8) | (FZ << 7) | (FN << 6) | (FH << 5) | (FC << 4)
    );
    PC = (PC + 1) | 0;
    return 16;
  }
  // F6 - OR d8
  function instF6() {
    PC = (PC + 1) | 0;
    RA = or8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // F7 - RST 30H
  function instF7() {
    PC = (PC + 1) | 0;
    call(48);
    return 16;
  }
  // F8 - LD HL,SP+r8
  function instF8() {
    PC = (PC + 1) | 0;
    RHL = add16(RSP | 0, signImmediate8() | 0) | 0;
    FZ = 0;
    PC = (PC + 1) | 0;
    return 12;
  }
  // F9 - LD SP,HL
  function instF9() {
    RSP = RHL;
    PC = (PC + 1) | 0;
    return 8;
  }
  // FA - LD A,(a16)
  function instFA() {
    PC = (PC + 1) | 0;
    RA = getAddress(immediate16() | 0) | 0;
    PC = (PC + 2) | 0;
    return 16;
  }
  // FB - EI
  function instFB() {
    IME = 1;
    PC = (PC + 1) | 0;
    executeInt();
    return 4;
  }
  // FC -
  function instFC() {
    return 0;
  }
  // FD -
  function instFD() {
    return 0;
  }
  // FE - CP d8
  function instFE() {
    PC = (PC + 1) | 0;
    sub8(RA | 0, immediate8() | 0) | 0;
    PC = (PC + 1) | 0;
    return 8;
  }
  // FF - RST 38H
  function instFF() {
    PC = (PC + 1) | 0;
    call(56);
    return 16;
  }

  function cbinstruction(code) {
    code = code | 0;
    var data = 0;
    var data0 = 0;
    var op = 0;

    switch ((code | 0) % 8 | 0) {
      case 0:
        data = RB;
        break;
      case 1:
        data = RC;
        break;
      case 2:
        data = RD;
        break;
      case 3:
        data = RE;
        break;
      case 4:
        data = RHL >> 8;
        break;
      case 5:
        data = RHL & 0xff;
        break;
      case 6:
        data = getAddress(RHL | 0) | 0;
        break;
      case 7:
        data = RA;
        break;
    }
    data0 = data;

    op = ((code | 0) / 8) | 0;
    if (((op | 0) >= 0) & ((op | 0) <= 7)) {
      if ((op | 0) == 0) {
        // RLC - Rotate left
        if ((data | 0) >= 128) {
          data = (((data << 1) % 256 | 0) + 1) | 0;
          FC = 1;
        } else {
          data = (data << 1) % 256 | 0;
          FC = 0;
        }
      } else if ((op | 0) == 1) {
        // RRC - Rotate right
        if ((data | 0) & 1) {
          data = ((data >> 1) + 128) | 0;
          FC = 1;
        } else {
          data = data >> 1;
          FC = 0;
        }
      } else if ((op | 0) == 2) {
        // RL - Rotate left through carry
        if ((data | 0) >= 128) {
          data = (((data << 1) % 256 | 0) + FC) | 0;
          FC = 1;
        } else {
          data = (((data << 1) % 256 | 0) + FC) | 0;
          FC = 0;
        }
      } else if ((op | 0) == 3) {
        // RR - Rotate right through carry
        if ((data | 0) & 1) {
          data = ((data >> 1) + ((FC * 128) | 0)) | 0;
          FC = 1;
        } else {
          data = ((data >> 1) + ((FC * 128) | 0)) | 0;
          FC = 0;
        }
      } else if ((op | 0) == 4) {
        // SLA - Shift left arithmetic
        if ((data | 0) >= 128) FC = 1;
        else FC = 0;
        data = (data << 1) % 256 | 0;
      } else if ((op | 0) == 5) {
        // SRA - Shift right arithmetic
        if ((data | 0) & 1) {
          FC = 1;
        } else {
          FC = 0;
        }
        data = ((data >> 1) + ((data | 0) >= 128 ? 128 : 0)) | 0;
      } else if ((op | 0) == 6) {
        // SWAP - Exchange low/hi-nibble
        FC = 0;
        data = (((data | 0) % 16 | 0) * 16) | (0 + (((data | 0) / 16) | 0));
      } else if ((op | 0) == 7) {
        // SRL - Shift right logical
        if (data & 1) {
          FC = 1;
        } else {
          FC = 0;
        }
        data = data >> 1;
      }
      if ((data | 0) == 0) FZ = 1;
      else FZ = 0;
      FN = 0;
      FH = 0;
    }
    if (((op | 0) >= 8) & ((op | 0) <= 15)) {
      FN = 0;
      FH = 1;
      if ((data & (1 << (op - 8))) == 0) FZ = 1;
      else FZ = 0;
    }
    if (((op | 0) >= 16) & ((op | 0) <= 23)) {
      data = (data & ~(1 << (op - 16))) | 0;
    }
    if (((op | 0) >= 24) & ((op | 0) <= 31)) {
      data = data | (1 << (op - 24));
    }

    if ((data0 | 0) != (data | 0)) {
      switch ((code | 0) % 8 | 0) {
        case 0:
          RB = (data | 0) % 256 | 0;
          break;
        case 1:
          RC = (data | 0) % 256 | 0;
          break;
        case 2:
          RD = (data | 0) % 256 | 0;
          break;
        case 3:
          RE = (data | 0) % 256 | 0;
          break;
        case 4:
          setH((data | 0) % 256 | 0);
          break;
        case 5:
          setL((data | 0) % 256 | 0);
          break;
        case 6:
          putAddress(RHL | 0, (data | 0) % 256 | 0);
          break;
        case 7:
          RA = (data | 0) % 256 | 0;
          break;
      }
    }
  }

  function execute(n) {
    n = n | 0;
    var inst = 0;
    while (!stopped & ((n | 0) > 0)) {
      inst = getAddress(PC | 0) | 0;
      n = (n - (instructions[inst & 0xff]() | 0)) | 0;
    }
  }

  var instructions = [
    inst00,
    inst01,
    inst02,
    inst03,
    inst04,
    inst05,
    inst06,
    inst07,
    inst08,
    inst09,
    inst0A,
    inst0B,
    inst0C,
    inst0D,
    inst0E,
    inst0F,
    inst10,
    inst11,
    inst12,
    inst13,
    inst14,
    inst15,
    inst16,
    inst17,
    inst18,
    inst19,
    inst1A,
    inst1B,
    inst1C,
    inst1D,
    inst1E,
    inst1F,
    inst20,
    inst21,
    inst22,
    inst23,
    inst24,
    inst25,
    inst26,
    inst27,
    inst28,
    inst29,
    inst2A,
    inst2B,
    inst2C,
    inst2D,
    inst2E,
    inst2F,
    inst30,
    inst31,
    inst32,
    inst33,
    inst34,
    inst35,
    inst36,
    inst37,
    inst38,
    inst39,
    inst3A,
    inst3B,
    inst3C,
    inst3D,
    inst3E,
    inst3F,
    inst40,
    inst41,
    inst42,
    inst43,
    inst44,
    inst45,
    inst46,
    inst47,
    inst48,
    inst49,
    inst4A,
    inst4B,
    inst4C,
    inst4D,
    inst4E,
    inst4F,
    inst50,
    inst51,
    inst52,
    inst53,
    inst54,
    inst55,
    inst56,
    inst57,
    inst58,
    inst59,
    inst5A,
    inst5B,
    inst5C,
    inst5D,
    inst5E,
    inst5F,
    inst60,
    inst61,
    inst62,
    inst63,
    inst64,
    inst65,
    inst66,
    inst67,
    inst68,
    inst69,
    inst6A,
    inst6B,
    inst6C,
    inst6D,
    inst6E,
    inst6F,
    inst70,
    inst71,
    inst72,
    inst73,
    inst74,
    inst75,
    inst76,
    inst77,
    inst78,
    inst79,
    inst7A,
    inst7B,
    inst7C,
    inst7D,
    inst7E,
    inst7F,
    inst80,
    inst81,
    inst82,
    inst83,
    inst84,
    inst85,
    inst86,
    inst87,
    inst88,
    inst89,
    inst8A,
    inst8B,
    inst8C,
    inst8D,
    inst8E,
    inst8F,
    inst90,
    inst91,
    inst92,
    inst93,
    inst94,
    inst95,
    inst96,
    inst97,
    inst98,
    inst99,
    inst9A,
    inst9B,
    inst9C,
    inst9D,
    inst9E,
    inst9F,
    instA0,
    instA1,
    instA2,
    instA3,
    instA4,
    instA5,
    instA6,
    instA7,
    instA8,
    instA9,
    instAA,
    instAB,
    instAC,
    instAD,
    instAE,
    instAF,
    instB0,
    instB1,
    instB2,
    instB3,
    instB4,
    instB5,
    instB6,
    instB7,
    instB8,
    instB9,
    instBA,
    instBB,
    instBC,
    instBD,
    instBE,
    instBF,
    instC0,
    instC1,
    instC2,
    instC3,
    instC4,
    instC5,
    instC6,
    instC7,
    instC8,
    instC9,
    instCA,
    instCB,
    instCC,
    instCD,
    instCE,
    instCF,
    instD0,
    instD1,
    instD2,
    instD3,
    instD4,
    instD5,
    instD6,
    instD7,
    instD8,
    instD9,
    instDA,
    instDB,
    instDC,
    instDD,
    instDE,
    instDF,
    instE0,
    instE1,
    instE2,
    instE3,
    instE4,
    instE5,
    instE6,
    instE7,
    instE8,
    instE9,
    instEA,
    instEB,
    instEC,
    instED,
    instEE,
    instEF,
    instF0,
    instF1,
    instF2,
    instF3,
    instF4,
    instF5,
    instF6,
    instF7,
    instF8,
    instF9,
    instFA,
    instFB,
    instFC,
    instFD,
    instFE,
    instFF
  ];

  return {
    execute: execute,
    stop: stop,
    resume: resume,
    interrupt: interrupt
  };
});
