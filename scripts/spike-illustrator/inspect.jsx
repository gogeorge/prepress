// Illustrator spike inspector (ExtendScript, ES3). Opens every PDF in the
// folder given as arguments[0], records layers, groups and text frames, and
// writes <folder>/results.json. Run through inspect.applescript.

var dir = new Folder(arguments[0]);
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
app.preferences.PDFFileOptions.pageToOpen = 1;

function q(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
}
function json(v, ind) {
  ind = ind || "";
  var n = ind + "  ", i, out = [];
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return q(v);
  if (v instanceof Array) {
    if (!v.length) return "[]";
    for (i = 0; i < v.length; i++) out.push(n + json(v[i], n));
    return "[\n" + out.join(",\n") + "\n" + ind + "]";
  }
  for (var k in v) out.push(n + q(k) + ": " + json(v[k], n));
  return "{\n" + out.join(",\n") + "\n" + ind + "}";
}
function r2(x) {
  return Math.round(x * 100) / 100;
}

// Fonts installed before any PDF is opened; opened documents add their missing fonts to app.textFonts.
var INSTALLED = {};
for (var t = 0; t < app.textFonts.length; t++) INSTALLED[app.textFonts[t].name] = true;
function installed(name) {
  return INSTALLED[name] === true;
}

function fontRuns(tf) {
  var runs = [], chars = tf.textRange.characters, cur = null, i, name, scale, ch;
  for (i = 0; i < chars.length; i++) {
    ch = chars[i];
    try {
      name = ch.characterAttributes.textFont.name;
    } catch (e) {
      name = "?" + e.message;
    }
    scale = ch.characterAttributes.horizontalScale;
    if (!cur || cur.font !== name || cur.hScale !== scale) {
      cur = { font: name, installed: installed(name), hScale: scale, text: "" };
      runs.push(cur);
    }
    cur.text += ch.contents;
  }
  return runs;
}

function item(it) {
  var o = { type: it.typename };
  if (it.name) o.name = it.name;
  if (it.typename === "GroupItem") {
    o.clipped = it.clipped;
    o.children = items(it.pageItems);
  } else if (it.typename === "TextFrame") {
    o.kind = String(it.kind);
    o.contents = it.contents;
    var m = it.matrix;
    o.matrix = [r2(m.mValueA), r2(m.mValueB), r2(m.mValueC), r2(m.mValueD)];
    o.runs = fontRuns(it);
  } else if (it.typename === "PathItem") {
    o.filled = it.filled;
    o.stroked = it.stroked;
    o.clipping = it.clipping;
    o.points = it.pathPoints.length;
  } else if (it.typename === "CompoundPathItem") {
    o.paths = it.pathItems.length;
  }
  return o;
}

function items(coll) {
  var out = [];
  for (var i = 0; i < coll.length; i++) out.push(item(coll[i]));
  return out;
}

function layer(l) {
  return { name: l.name, printable: l.printable, visible: l.visible, sublayers: layers(l.layers), items: items(l.pageItems) };
}
function layers(coll) {
  var out = [];
  for (var i = 0; i < coll.length; i++) out.push(layer(coll[i]));
  return out;
}

var files = dir.getFiles("*.pdf"), results = {}, doc;
files.sort(function (a, b) {
  return a.name < b.name ? -1 : 1;
});
for (var f = 0; f < files.length; f++) {
  try {
    doc = app.open(files[f]);
    results[files[f].name] = {
      layers: layers(doc.layers),
      textFrames: doc.textFrames.length,
      groupItems: doc.groupItems.length,
      pathItems: doc.pathItems.length,
    };
    doc.close(SaveOptions.DONOTSAVECHANGES);
  } catch (e) {
    results[files[f].name] = { error: e.message + " (line " + e.line + ")" };
  }
}

var outFile = new File(dir.fsName + "/results.json");
outFile.encoding = "UTF-8";
outFile.open("w");
outFile.write(json(results));
outFile.close();
"ok";
