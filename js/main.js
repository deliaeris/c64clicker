requirejs.config({
    baseUrl: 'js',
    packages: ['c64'],
    paths: {
        jquery: '//ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min'
    }
});
require([
    'jquery',
    'c64',
    'thirdparty/domReady',
    'thirdparty/biginteger',
    'thirdparty/jquery.powertip.min'
], function($, C64, domReady, bigint, powertip) {
    VIC = C64.VIC;
    window.CClicker = {
        FPS: 40,

        bank: null,
        produced: null,
        spent: null,
        maxPrice: null,
        clickPower: null,
        cps: null,
        cps_div: null,
        cps_step: null,
        step_prev: null,
        frames: null,
        thisFrame: null,
        currPeriodStr: null,

        units: [{
            name: 'Water clock',
            description: "Drip pixels onto the screen. It's a slow process. (+1/s)",
            cps: 1,
            displayAt: 0,
            basePrice: 64
        },{
            name: 'Hamster wheel',
            description: "Hamsters never get tired, as we all know. (+8/s)",
            cps: 8,
            displayAt: 256,
            basePrice: 504
        },{
            name: 'Relay',
            description: "A somewhat loud electromagnetic clicker. (+32/s)",
            cps: 32,
            displayAt: 2048,
            basePrice: 4032,
        },{
            name: 'RC oscillator',
            description: "At least it's quieter. (+128/s)",
            cps: 128,
            displayAt: 8192,
            basePrice: 24192
        },{
            name: '555 timer',
            description: "Electronics! Transistors! Other good things! (+504/s)",
            cps: 504,
            displayAt: 65536,
            basePrice: 157248
        },{
            name: 'Phase-locked loop',
            description: "An accurate oscillator is a rare thing. (+4 lines/s)",
            cps: 2016,
            displayAt: 262144,
            basePrice: 1048576
        },{
            name: 'Coal crystal',
            description: "It's a crystal, that must be better. (+16 lines/s)",
            cps: 8064,
            displayAt: 2097152,
            basePrice: 4194304
        },{
            name: 'Graphite crystal',
            description: "I knew there was something wrong with coal. (+78 lines/s)",
            cps: 39312,
            displayAt: 8388608,
            basePrice: 24772608
        },{
            name: 'Quartz crystal',
            description: "Used in watches, with good reason. (+1 frame/s)",
            cps: 157248,
            displayAt: 67108864,
            basePrice: 134217728
        }],

        upgrades: [{
            name: 'Doubleclick',
            description: "What it says on the tin. (+1px per click)",
            power: 1,
            displayAt: 0,
            price: 64
        },{
            name: 'Multi-touch',
            description: "It's like two fingers are clicking. (+4px per click)",
            power: 4,
            displayAt: 128,
            price: 256
        },{
            name: 'Bouncy fingers',
            description: "Adds springs to the mouse button. (+16px per click)",
            power: 16,
            displayAt: 1024,
            price: 2048
        },{
            name: 'Multibyte click',
            description: "An extra-wide mouse button. (+64px per click)",
            power: 64,
            displayAt: 8192,
            price: 16384
        },{
            name: 'Raster-click',
            description: "All hail his Noodliness. No, hold on... (+1 line per click)",
            power: 504,
            displayAt: 32768,
            price: 157248
        },{
            name: 'Raster-bars',
            description: "LOADING... (random border color every 8 lines)",
            effect_vic: 'rasterbars',
            displayAt: 80000,
            price: 157248
        },{
            name: 'If I had a million pixels',
            description: "I'd click two lines at the same time, man. (+2 lines per click)",
            power: 1008,
            displayAt: 157248,
            price: 1048576
        },{
            name: '[C64 intensifies]',
            description: "Oh Lord there's a quake! (random character offset per frame)",
            effect_vic: 'scrollshake',
            displayAt: 1048576,
            price: 1572840
        },{
            name: 'Sanyo TV',
            description: "It's ever so slightly bigger. (+25% screen size)",
            effect_main: 'quarterscreen',
            displayAt: 2097152,
            price: 3144960
        },{
            name: 'Foam finger',
            description: "It's a bit... big, isn't it? (+8 lines per click)",
            power: 4032,
            displayAt: 2097152,
            price: 8388608
        },{
            name: 'Foam hand',
            description: "All the fingers, at once. (+40 lines per click)",
            power: 20160,
            displayAt: 10485760,
            price: 50331648
        }],

        frontCanvas: null,
        frontContext: null,
        intervals: null,
        effects: {
            quarterscreen: false
        },
        thread: null,

        reset: function() {
            this.cps = BigInteger(0);
            this.bank = BigInteger(0);
            this.produced = BigInteger(0);
            this.spent = BigInteger(0);
            this.maxPrice = BigInteger(0);
            this.frames = BigInteger(0);
            this.thisFrame = BigInteger(0);
            this.clickPower = BigInteger(1);
            this.cps_step = 0;
            this.cps_div = 0;
            this.step_prev = new Date();

            var i;
            for (i in this.units) {
                this.units[i].currPrice = BigInteger(this.units[i].basePrice);
                this.units[i].count = 0;
                if (this.maxPrice.compare(this.units[i].basePrice) < 0) {
                    this.maxPrice = BigInteger(this.units[i].basePrice);
                }
            }
            for (i in this.upgrades) {
                this.upgrades[i].purchased = false;
                if (this.maxPrice.compare(this.upgrades[i].price) < 0) {
                    this.maxPrice = BigInteger(this.upgrades[i].price);
                }
            }
            for (i in this.effects) {
                this.effects[i] = false;
                this.effectHandlers[i](true);
            }

            this.renderItems();
            this.showTab('units');

            VIC.reset();
        },
        inc: function(amt) {
            this.bank = this.bank.add(amt);
            this.produced = this.produced.add(amt);
            this.thisFrame = this.thisFrame.add(amt);
            while (this.thisFrame.compare(VIC.sizes.FRAME_SIZE) >= 0) {
                this.thisFrame = this.thisFrame.subtract(VIC.sizes.FRAME_SIZE);
                this.frames = this.frames.next();
                VIC.saveFrame(
                    this.frames.toJSValue(),
                    this.maxPrice.divide(VIC.sizes.FRAME_SIZE).toJSValue()
                );
            }
        },
        click: function() {
            this.inc(this.clickPower);
        },
        stepCalc: function() {
            var now = new Date(),
                elapsed = Math.floor((now.getTime() - this.step_prev.getTime()) / 1000);
            if (elapsed > 1) {
                this.inc(this.cps.multiply(elapsed));
            } else if (this.cps_step > (this.FPS / 2)) {
                this.inc(Math.round(this.cps_step * this.cps_div));
            } else {
                this.inc(this.cps);
            }
            this.cps_step = 0;
            this.step_prev = now;
        },
        stepDraw: function() {
            var bank, thisFrame, frames, cps_amt;

            this.cps_step++;
            cps_amt = (0.0 + this.cps_step) * this.cps_div;
            if (this.bank.compare(1073741824) < 0) {
                bank = this.bank.toJSValue() + cps_amt;
                bank = BigInteger(bank);
            } else {
                bank = this.bank.add(cps_amt);
            }

            thisFrame = this.thisFrame.add(cps_amt);
            frames = this.frames;
            while (thisFrame.compare(VIC.sizes.FRAME_SIZE) >= 0) {
                thisFrame = thisFrame.subtract(VIC.sizes.FRAME_SIZE);
                frames = frames.next();
                VIC.saveFrame(
                    frames.toJSValue(),
                    this.maxPrice.divide(VIC.sizes.FRAME_SIZE).toJSValue()
                );
            }

            // We're running a system here, and it may change state mid-frame,
            // so we have to run it from the start of frame to render it
            var renderEndpoint = 0;
            VIC.restoreFrame(frames.toJSValue());
            if (bank.isPositive()) {
                renderEndpoint = VIC.renderFrame(thisFrame.toJSValue());
            }

            var $item;
            for (i in this.units) {
                $item = $('li#unit' + i);
                if (bank.compare(this.units[i].displayAt) >= 0) {
                    $item.addClass('active');
                } else {
                    $item.removeClass('active');
                }
                if (bank.compare(this.units[i].currPrice) >= 0) {
                    $item.addClass('available');
                } else {
                    $item.removeClass('available');
                }
                $item.find('.count').text(this.units[i].count.toString());
                $item.find('.price').text(this.pluralize(this.units[i].currPrice.toString(), 'pixel'));
            }
            for (i in this.upgrades) {
                $item = $('li#upgrade' + i);
                if (
                  this.upgrades[i].purchased ||
                  bank.compare(this.upgrades[i].displayAt) < 0
                ) {
                    $item.removeClass('active');
                } else {
                    $item.addClass('active');
                }
                if (
                  !this.upgrades[i].purchased &&
                  bank.compare(this.upgrades[i].price) >= 0
                ) {
                    $item.addClass('available');
                } else {
                    $item.removeClass('available');
                }
            }

            $('#bank').text(this.pluralize(bank.toString(), 'pixel'));
            $('#pixels_per_click').text(this.pluralize(this.clickPower.toString(), 'pixel'));
            $('#clock').text(this.pluralize(this.cps.divide(8).toString(), 'Hz', false));
            $('#cps').text(this.pluralize(this.cps.toString(), 'pixel') + '/s');
            $('#curframe').text(frames.add(1).toString());
            $('#curraster').text(thisFrame.divide(VIC.sizes.RASTER_LENGTH));
            $('#curperiod').text(VIC.endpointStrings[renderEndpoint]);
            this.frontContext.drawImage(VIC.backCanvas, 0, 0);
        },
        showTab: function(rel) {
            $('ul.tabs li').removeClass('active');
            $('ul.tabs li[rel="' + rel + '"]').addClass('active');
            $('.itemlists > ul').hide();
            $('.itemlists > ul.' + rel).show();
        },
        buy: function($item) {
            var i = $item.attr('id').match(/\d+$/);
            if (i) {
                i = i[0];
            } else {
                return;
            }

            if ($item.parent().is('.units')) {
                if (this.bank.compare(this.units[i].currPrice) < 0) {
                    // How did we get here again?
                    return;
                }
                this.bank = this.bank.subtract(this.units[i].currPrice);
                this.thisFrame = this.thisFrame.subtract(this.units[i].currPrice);
                while (this.thisFrame.isNegative()) {
                    this.thisFrame = this.thisFrame.add(VIC.sizes.FRAME_SIZE);
                    this.frames = this.frames.prev();
                }
                this.spent = this.spent.add(this.units[i].currPrice);
                this.cps = this.cps.add(this.units[i].cps);
                if (this.cps.compare(1048576) < 0) {
                    this.cps_div = this.cps.toJSValue() / this.FPS;
                } else {
                    this.cps_div = this.cps.divide(this.FPS).toJSValue();
                }
                this.units[i].count++;
                this.units[i].currPrice = this.units[i].currPrice.multiply(5).divide(4);
                if (this.maxPrice.compare(this.units[i].currPrice) < 0) {
                    this.maxPrice = this.units[i].currPrice;
                }
                $item.find('.count').text(this.units[i].count);
                $item.find('.price').text(this.pluralize(this.units[i].currPrice.toString(), 'pixel'));
            } else if ($item.parent().is('.upgrades')) {
                if (this.bank.compare(this.upgrades[i].price) < 0) {
                    return;
                }
                this.bank = this.bank.subtract(this.upgrades[i].price);
                this.thisFrame = this.thisFrame.subtract(this.upgrades[i].price);
                while (this.thisFrame.isNegative()) {
                    this.thisFrame = this.thisFrame.add(VIC.sizes.FRAME_SIZE);
                    this.frames = this.frames.prev();
                }
                this.spent = this.spent.add(this.upgrades[i].price);
                if (this.upgrades[i].power) {
                    this.clickPower = this.clickPower.add(this.upgrades[i].power);
                } else if (this.upgrades[i].effect_vic) {
                    VIC.effects[this.upgrades[i].effect_vic] = true;
                } else if (this.upgrades[i].effect_main) {
                    this.effects[this.upgrades[i].effect_main] = true;
                    this.effectHandlers[this.upgrades[i].effect_main]();
                }
                this.upgrades[i].purchased = true;
                $item.removeClass('active');
            }
        },
        renderItems: function() {
            var i;
            this.C64 = C64;
            $('.itemlists ul').empty();
            for (i in this.units) {
                $('ul.units').append([
                    '<li id="unit', i, '" title="', this.units[i].description, '">',
                     '<span class="name">', this.units[i].name, '</span>',
                     '<span class="count">',
                      this.units[i].count ? this.units[i].count : 'None',
                     '</span>',
                     '<span class="price">',
                      this.pluralize(this.units[i].currPrice.toString(), 'pixel'),
                     '</span>',
                    '</li>'
                ].join(''));
            }
            for (i in this.upgrades) {
                if (!this.upgrades[i].purchased) {
                    $('ul.upgrades').append([
                        '<li id="upgrade', i, '" title="', this.upgrades[i].description, '">',
                         '<span class="name">', this.upgrades[i].name, '</span>',
                         '<span class="price">',
                          this.pluralize(this.upgrades[i].price, 'pixel'),
                         '</span>',
                        '</li>'
                    ].join(''));
                }
            }
            $('.itemlists li').off('click').on('click', function(e) {
                this.buy($(e.target).closest('li'));
                return false;
            }.bind(this)).powerTip();
        },
        effectHandlers: {
            quarterscreen: function(disable) {
                if (disable) {
                    $('body').removeClass('quarterscreen');
                } else {
                    $('body').addClass('quarterscreen');
                }
            }
        },
        init: function() {
            // Polyfill courtesy of Mozilla
            if (!Function.prototype.bind) {
              Function.prototype.bind = function(oThis) {
                if (typeof this !== 'function') {
                  // closest thing possible to the ECMAScript 5
                  // internal IsCallable function
                  throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable');
                }

                var aArgs   = Array.prototype.slice.call(arguments, 1),
                    fToBind = this,
                    fNOP    = function() {},
                    fBound  = function() {
                      return fToBind.apply(this instanceof fNOP && oThis
                             ? this
                             : oThis,
                             aArgs.concat(Array.prototype.slice.call(arguments)));
                    };

                fNOP.prototype = this.prototype;
                fBound.prototype = new fNOP();

                return fBound;
              };
            }
            VIC.init.call(VIC);

            this.frontCanvas = document.getElementById('screen');
            this.frontCanvas.width = VIC.sizes.RASTER_LENGTH;
            this.frontCanvas.height = VIC.sizes.RASTER_COUNT;
            this.frontContext = this.frontCanvas.getContext('2d');

            this.reset();
            this.load();
            this.renderItems();

            $('.head h1 a').on('mouseenter', function(e) {
                if (!$(this).data('powertip')) {
                    $(this).data('powertip', $('#about').html()).powerTip({
                        manual: true,
                        placement: 's'
                    });
                }
                $(this).powerTip('show', e);
            }).on('mouseleave', function() {
                $(this).powerTip('hide');
            });
            $('#click').on('click', this.click.bind(this));
            $('.tabs li').on('click', function(e) {
                this.showTab($(e.target).attr('rel'));
                return false;
            }.bind(this));
            $('#reset').on('click', function(e) {
                if (confirm("You're sure you want to wipe your game progress?")) {
                    this.wipe();
                }
                return false;
            }.bind(this));
            $('#lightmode').on('click', function(e) {
                if ($('#lightmode').is(':checked')) {
                    this.FPS = 1;
                } else {
                    this.FPS = 40;
                }
                clearInterval(this.intervals.step);
                this.intervals.step = setInterval(this.stepDraw.bind(this), 1000 / this.FPS);
            }.bind(this));

            this.intervals = {
                step: setInterval(this.stepDraw.bind(this), 1000 / this.FPS),
                calc: setInterval(this.stepCalc.bind(this), 1000),
                save: setInterval(this.save.bind(this), 5000)
            };
        },
        load: function() {
            if (!window.localStorage['c64click.bank']) {
                // First run!
                return;
            }

            this.FPS = parseInt(window.localStorage['c64click.FPS']);
            var i, vars = ['bank', 'cps', 'clickPower', 'produced', 'spent', 'frames', 'thisFrame'];
            for (i in vars) {
                this[vars[i]] = BigInteger(window.localStorage['c64click.' + vars[i]]);
            }
            if (this.cps.compare(1048576) < 0) {
                this.cps_div = this.cps.toJSValue() / this.FPS;
            } else {
                this.cps_div = this.cps.divide(this.FPS).toJSValue();
            }
            VIC.BORDER = 0|window.localStorage['c64click.VIC.border'];
            VIC.BG0 = 0|window.localStorage['c64click.VIC.background'];
            for (i in VIC.effects) {
                VIC.effects[i] = !!(0|window.localStorage['c64click.VIC.effects.' + i]);
            }
            for (i in this.effects) {
                this.effects[i] = !!(0|window.localStorage['c64click.effects.' + i]);
                this.effectHandlers[i](!this.effects[i]);
            }
            for (i in this.units) {
                this.units[i].currPrice = BigInteger(window.localStorage['c64click.units.' + i + '.currPrice']);
                this.units[i].count = 0|window.localStorage['c64click.units.' + i + '.count'];
            }
            for (i in this.upgrades) {
                this.upgrades[i].purchased = !!(0|window.localStorage['c64click.upgrades.' + i + '.purchased']);
            }
            if (this.FPS == 1) {
                $('#lightmode').attr('checked', true)
            }
        },
        save: function() {
            var i, state = {
                'FPS':          this.FPS.toString(),
                'bank':         this.bank.toString(),
                'cps':          this.cps.toString(),
                'clickPower':   this.clickPower.toString(),
                'produced':     this.produced.toString(),
                'spent':        this.spent.toString(),
                'frames':       this.frames.toString(),
                'thisFrame':    this.thisFrame.toString()
            };
            state['VIC.border'] = VIC.BORDER;
            state['VIC.background'] = VIC.BG0;
            for (i in VIC.effects) {
                state['VIC.effects.' + i] = VIC.effects[i] ? 1 : 0;
            }
            for (i in this.effects) {
                state['effects.' + i] = this.effects[i] ? 1 : 0;
            }
            for (i in this.units) {
                state['units.' + i + '.currPrice'] = this.units[i].currPrice.toString();
                state['units.' + i + '.count'] = 0|this.units[i].count;
            }
            for (i in this.upgrades) {
                state['upgrades.' + i + '.purchased'] = this.upgrades[i].purchased ? 1 : 0;
            }

            for (i in state) {
                window.localStorage['c64click.' + i] = state[i];
            }
        },
        wipe: function() {
            window.localStorage.clear();
            this.reset();
        },
        pluralize: function(num, str, doPlural) {
            if (doPlural === undefined) {
                doPlural = true;
            }
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
                " " + str +
                ((num == '1' || !doPlural) ? '' : 's');
        }
    };

    domReady(CClicker.init.bind(CClicker));
});
