org = typeof(org) === 'undefined' ? {} : org;
org.sriku = org.sriku || {};

(function (Renderer) {
    Renderer.render = function render(notationURL, document, delegate) {
        var request = new XMLHttpRequest();
        request.open('GET', notationURL, true);
        request.onload = function () {
            if (delegate && delegate.didFetchURL) {
                delegate.didFetchURL(notationURL, request.responseText);
            }

            var doc = org.sriku.NotationParser(request.responseText);

            if (delegate && delegate.didFinishParsing) {
                delegate.didFinishParsing(notationURL, doc);
            }

            displayMeta(doc);
            displayNotation(doc, 'div.notation');

            if (delegate && delegate.didFinishRendering) {
                delegate.didFinishRendering(notationURL);
            }
        };
        request.onerror = function () {
            if (delegate && delegate.onError) {
                delegate.onError('Failed to fetch URL', notationURL);
            }
        };
        request.send();

        function find(tree, label) {
            return findAll(tree, label)[0];
        }

        function findAll(tree, label) {
            label = label.toLowerCase();
            return tree.filter(function (entity) {
                return entity.label.toLowerCase() === label;
            });
        }

        function q(sel) {
            return document.querySelector(sel);
        }

        function displayMeta(doc) {
            var info = find(doc, 'info');
            var infoFields = info.entities[0];
            q('#title').innerHTML = infoFields.$title;
            q('#type').innerHTML = infoFields.$type;
            q('#composer').innerHTML = infoFields.$composer;
            var raga = find(info.entities, 'raga').entities[0];
            var tala = find(info.entities, 'tala').entities[0];
            q('#raga').innerHTML = raga.$name;
            q('#arohana').innerHTML = notationString(raga.$arohana);
            q('#avarohana').innerHTML = notationString(raga.$avarohana);
            q('#tala').innerHTML = tala.$name;
            displayBody(find(doc, 'lyrics'), clear(q('#lyrics')));
            displayBody(find(doc, 'translation'), clear(q('#translation')));

            function displayBody(node, element) {
                node.entities.forEach(function (entity) {
                    if (entity.label === 'paragraph') {
                        entity.entities.forEach(function (line) {
                            element.insertAdjacentHTML('beforeend', line + '<br/>');
                        });
                        element.insertAdjacentHTML('beforeend', '<br/>');
                    } else {
                        element.insertAdjacentHTML('beforeend', '<br/><span class="labelFont">' + entity.label + '</span><br/>');
                        displayBody(entity, element);
                    }
                });
            }
        }

        function clear(element) {
            if (element) {
                var nodes = element.childNodes;
                Array.prototype.slice.call(nodes).forEach(function (n) {
                    n.parentNode.removeChild(n);
                });
            }
            return element;
        }

        function displayNotation(doc, elementSpec) {
            var kLineSpacing = 22;
            var kNotationFontSize = 13;
            var kNotationSmallFontSize = kNotationFontSize - 2;
            var kSectionHeadingFontSize = 18;
            var kNotationFont = 'font-family: serif;';
            var kHorizStretch = 1.6;

            var info = find(doc, 'info');
            var tala = find(info.entities, 'tala');
            var notation = find(doc, 'notation');
            if (!notation) {
                return;
            }
            console.assert(info && tala && notation);
            var pattern = patternForTala(tala);

            var div = clear(document.querySelector(elementSpec));
            console.assert(div);
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            div.insertBefore(svg, null);

            var state = {};
            function loadState(node) {
                var keys = Object.keys(node).filter(function (k) { return k[0] === '$'; });
                keys.forEach(function (k) {
                    state[k] = node[k];
                });
                return state;
            }
            function pushState() {
                var prevState = state;
                state = Object.create(state);
                state.PARENT = prevState;
                return state;
            }
            function popState() {
                return (state = state.PARENT);
            }

            state.$scale = kHorizStretch;
            var iSec, iSecN, iPara, iParaN, x = 0, y = 50, patternIx = 0, paraPatternIx = 0, width = 0;
            notation.entities.forEach(function (node, iSec) {
                if (node.label === 'paragraph') {
                    loadState(node);
                } else {
                    y += kLineSpacing;
                    svgelem(svg, 'text', {x: 0, y: y, style: 'font-size: ' + kSectionHeadingFontSize + 'pt; font-weight: bold;'}, node.label);
                    y += kLineSpacing;
                    patternIx = paraPatternIx = 0;
                    pushState();
                    node.entities.forEach(typesetPara);
                    popState();
                }
            });

            svg.setAttribute('width', width);
            svg.setAttribute('height', y);


            function typesetPara(para) {
                if (para.entities.length > 0) {
                    y += kLineSpacing;
                    pushState();
                    loadState(para);
                    state.$scale = typeof(state.$scale) === 'number' ? state.$scale : parseFloat(state.$scale);
                    para.entities.forEach(typesetLine);
                    paraPatternIx = patternIx;
                    popState();
                    y += kLineSpacing;
                } else {
                    loadState(para);
                }
            }

            function typesetLine(line) {
                if (line.match(/^\s*\>/)) {
                    typesetTextLine(line);
                } else {
                    patternIx = paraPatternIx;
                    typesetNotation(line);
                }
            }

            function typesetTextLine(line) {
                var content = line.trim().split(/^\>\s*/)[1];
                svgelem(svg, 'text', {x: 0, y: y, style: 'font-size: 12pt;'}, content);
                y += kLineSpacing;
            }

            function typesetNotation(line) {
                var contents = line.trim().split(/\s+/g).map(show);
                console.assert(pattern);
                var pi, pN, i, N, x, j;
                var subdivs = contents.length / parseInt(state['$aksharas per line'], 10);
                var style = ('font-size:' + (subdivs > 2 ? kNotationSmallFontSize : kNotationFontSize) + 'pt; ' + kNotationFont);
                var lineSpace = 0;
                for (i = 0, N = contents.length, pi = patternIx, pN = pattern.length, x = 0; i < N; pi = (pi + 1) % pN) {
                    var inst = pattern[pi];
                    if (inst.hasOwnProperty('tick')) {
                        if (lineSpace > 0) {
                            x += lineSpace;
                            lineSpace = 0;
                        }
                        // Consume one element.
                        for (j = 0; j < subdivs; ++j) {
                            svgelem(svg, 'text', {x: x, y: y, style: style}, contents[i]);
                            ++i;
                            x += inst.tick * state.$scale / subdivs;
                        }
                    }

                    // Consume other non-tick instructions up to the next tick.
                    while (!pattern[(pi + 1) % pN].hasOwnProperty('tick')) {
                        pi = (pi + 1) % pN;
                        if (pattern[pi].hasOwnProperty('space')) {
                            x += pattern[pi].space * state.$scale;
                            lineSpace = 0;
                        } else if (pattern[pi].hasOwnProperty('line')) {
                            if (pattern[pi].draw) {
                                svgelem(svg, 'line', {x1: x, y1: y, x2: x, y2: (y - kLineSpacing), 'stroke-width': 2, stroke: 'black'});
                            }
                            x += 5;
                            lineSpace += pattern[pi].line;
                        }
                    }
                }

                patternIx = pi % pN;
                y += kLineSpacing;
                width = Math.max(x, width);
            }
        }

        function patternForTala(tala) {
            var pattern;
            var i, N;
            for (i = 0, N = tala.entities.length; i < N; ++i) {
                pattern = tala.entities[i].$pattern;
                if (pattern) {
                    break;
                }
            }

            console.assert(pattern);

            var instrs = [];
            for (i = 0, N = pattern.length; i < N; ++i) {
                switch (pattern[i]) {
                    case ',': 
                        instrs.push({tick: 40});
                        break;
                    case ' ':
                        instrs.push({space: 10});
                        break;
                    case '|':
                        instrs.push({line: 10, draw: true});
                        break;
                    case '_':
                        instrs.push({line: 10, draw: false});
                        break;
                    default:
                        console.error('Unknown pattern character ' + pattern[i]); // Ignore.
                }
            }

            return instrs;
        }

        function notationString(str) {
            return str.split(/\s+/g).map(show).join(' ');
        }

        function show(text) {
            var hisa = "Ṡ";
            var losa = "Ṣ";

            if (text === '_') {
                return "";
            } 

            if (text.length === 2 && text[1] === '+') {
                return text[0] + hisa[1];
            } 

            if (text.length === 2 && text[1] === '-') {
                return text[0] + losa[1];
            }

            return text;
        }

        function svgelem(elem, n, attrs, content) {
            var tag = document.createElementNS('http://www.w3.org/2000/svg', n);
            if (attrs) {
                Object.keys(attrs).forEach(function (k) {
                    if (attrs[k]) {
                        tag.setAttribute(k, attrs[k]);
                    }
                });
            }
            if (content) {
                tag.textContent = content;
            }
            elem.appendChild(tag);
            return tag;
        }
    };

}(org.sriku.NotationRenderer = {}));
