
org = typeof(org) === 'undefined' ? {} : org;
org.sriku = org.sriku || {};

org.sriku.NotationParser = (function () {
    
    function parser(string) {

        var lines = splitLines(string);
        var sections = groupSections(lines);
        var tree = hierarchize(sections, 1);

        return processAttributes(tree);
    }
    
    function splitLines(string) {
        return string.trim().split('\n').map(trim);
    }

    function groupSections(lines) {
        var sections = [], section;
        lines.forEach(function (line) {
            var header = line.match(/^\#+/);
            if (header) {
                // Remove trailing blank lines
                while (section && section.entities.length > 0 && section.entities[section.entities.length - 1].length === 0) {
                    section.entities.pop();
                }

                // Start new section.
                section = {
                    label: line.slice(header[0].length).trim(),
                    depth: header[0].length, 
                    parent: undefined,
                    entities: []
                };
                sections.push(section);
            } else {
                console.assert(section);
                if (line.length === 0 && (section.entities.length === 0 || section.entities[section.entities.length - 1].length === 0)) {
                    // Skip leading blank lines and collapse multiple blank lines into one.
                } else {
                    section.entities.push(line);
                }
            }
        });
        return sections;
    }

    function hierarchize(sections, depth, parent) {
        if (sections.length === 1) {
            return sections;
        }

        var result = [];
        var i, N, start, run = null;
        for (i = 0, start = 1, N = sections.length; i < N; ++i) {
            if (run) {
                if (sections[i].depth <= run.depth) {
                    run.entities = run.entities.concat(hierarchize(sections.slice(start, i), run.depth + 1, run));
                    result.push(run = sections[i]);
                    run.parent = parent;
                    start = i + 1;
                }
            } else {
                result.push(run = sections[0]);
                run.parent = parent;
                start = i + 1;
            }
        }

        if (start < N) {
            run.entities = run.entities.concat(hierarchize(sections.slice(start, N), run.depth + 1, run));
        }

        return result.map(function (entity) {
            if (entity.entities) {
                entity.entities = collectParagraphs(entity.entities, entity.depth + 1, entity);
            }
            return entity;
        });
    }

    function collectParagraphs(entities, depth, parent) {
        var result = [], paragraph;
        entities.forEach(function (entity) {
            if (typeof(entity) === 'string') {
                if (entity.length === 0) {
                    // Break paragraph
                    paragraph = null;
                }
                
                if (!paragraph) {
                    paragraph = {
                        label: 'paragraph',
                        depth: depth,
                        parent: parent,
                        entities: []
                    };
                    result.push(paragraph);
                }

                if (entity.length > 0) {
                    paragraph.entities.push(entity);
                }
            } else {
                // Break paragraph
                paragraph = null;
                result.push(entity);
            }
        });
        return result;
    }

    function processAttributes(entities, node) {
        var attrRE = /\s+\=\s+/g;

        var i, entity, fields;
        for (i = 0; i < entities.length;) {
            entity = entities[i];
            if (typeof entity === 'string') {
                if (entity.match(attrRE)) {
                    if (node) {
                        fields = entity.split(attrRE).map(trim);
                        console.assert(fields.length >= 2);
                        node['$' + fields[0].toLowerCase()] = fields[1];
                    }
                    entities.splice(i, 1);
                } else {
                    ++i;
                }
            } else {
                processAttributes(entity.entities, entity);
                ++i;
            }
        }

        return entities;
    }

    function trim(string) {
        // Trim surrounding spaces and normalized intervening white space.
        return string.trim().split(/\s+/g).join(' ');
    }
    
    return parser;
}());
