# Builds public/fonts/dirham.woff: a one-glyph web font for the UAE dirham sign (U+20C3),
# used until system fonts support it. Glyph: a "D" crossed by two horizontal bars.
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

UPM, ADV = 1000, 860
def draw(pen):
    q = Cu2QuPen(pen, 1.0, reverse_direction=False)
    # outer D (clockwise in TrueType = filled)
    q.moveTo((170, 0)); q.lineTo((170, 700)); q.lineTo((380, 700))
    q.curveTo((620, 700), (760, 560), (760, 350)); q.curveTo((760, 140), (620, 0), (380, 0)); q.closePath()
    # counter (counter-clockwise = hole)
    q.moveTo((280, 105)); q.lineTo((375, 105)); q.curveTo((555, 105), (648, 205), (648, 350))
    q.curveTo((648, 495), (555, 595), (375, 595)); q.lineTo((280, 595)); q.closePath()
    # two bars, extending left past the stem and right past the bowl
    for y0, y1 in ((395, 465), (235, 305)):
        q.moveTo((40, y0)); q.lineTo((40, y1)); q.lineTo((820, y1)); q.lineTo((820, y0)); q.closePath()

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'space', 'dirham'])
fb.setupCharacterMap({0x20: 'space', 0x20C3: 'dirham'})
glyphs = {}
p = TTGlyphPen(None); glyphs['.notdef'] = p.glyph()
p = TTGlyphPen(None); glyphs['space'] = p.glyph()
p = TTGlyphPen(None); draw(p); glyphs['dirham'] = p.glyph()
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'space': (250, 0), 'dirham': (ADV, 40)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Dirham Sign', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.font.flavor = 'woff'
fb.save(sys.argv[1])
