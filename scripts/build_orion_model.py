"""Generate the three PBR GLBs for the Orion-inspired IGNIS demonstrator.

World axes are X right, Y along the stack, Z toward the cabin cutaway.
The geometry is an original interpretive model, not Orion flight CAD.
"""

from collections import defaultdict
import json
from math import cos, sin, pi, sqrt
from pathlib import Path
from random import Random
import struct


OUTPUT = Path(__file__).resolve().parents[1] / "dist" / "assets"
TAU = 2 * pi
PALETTE = {
    "titanium": ("#647181", .64, .43), "hardware": ("#a6b6ca", .61, .36),
    "shadow": ("#263142", .35, .62), "steel": ("#d5e3ee", .49, .31),
    "silver": ("#bec9ce", .48, .43), "silver-light": ("#d7e3e7", .46, .40),
    "silver-mid": ("#aebbc5", .49, .48), "silver-dark": ("#929fa9", .52, .44),
    "ceramic": ("#e1e7e0", .13, .56), "radiator": ("#e1e7e7", .26, .55),
    "foil": ("#b88139", .58, .39), "foil-light": ("#e4bd63", .50, .42),
    "foil-dark": ("#8a5b26", .54, .53), "insulation": ("#e8e3d6", .05, .74),
    "edge": ("#503c30", .16, .80), "avcoat": ("#c79d76", .02, .78),
    "avcoat-light": ("#cfaa81", .02, .79), "avcoat-dark": ("#ba8f68", .02, .81),
    "carbon": ("#36383e", .27, .65), "ring": ("#e0b984", .45, .43),
    "glass": ("#213e60", .55, .20), "glass-glint": ("#52758f", .51, .23),
    "blue-cell": ("#234469", .30, .34), "blue-mid": ("#2e527c", .30, .38),
    "blue-light": ("#43668a", .28, .36), "trace": ("#688aa4", .4, .44),
    "paint": ("#ebeee8", .09, .54), "upholstery": ("#516887", .05, .78),
    "padding": ("#29354a", .06, .8), "strap": ("#dea762", .05, .65),
    "cyan": ("#79c6cd", .22, .34), "green": ("#80aca0", .18, .47),
    "coolant": ("#62a9bd", .35, .37), "red": ("#bb5548", .29, .5),
    "orange": ("#e28555", .17, .56), "screen": ("#163244", .2, .31),
    "display": ("#6aaec5", .14, .46), "white": ("#f5eee0", .05, .51),
}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def times(v, scale):
    return tuple(x * scale for x in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    size = sqrt(dot(v, v))
    return times(v, 1 / size) if size > 1e-9 else (0, 1, 0)


def radial(radius, height, angle):
    return (radius * sin(angle), height, radius * cos(angle))


class Model:
    def __init__(self):
        self.batches = defaultdict(lambda: ([], [], []))
        self.group = "Nave"

    def triangle(self, mat, a, b, c, normals=None):
        pos, nor, indices = self.batches[self.group, mat]
        if normals is None:
            normal = unit(cross(sub(b, a), sub(c, a)))
            normals = (normal,) * 3
        offset = len(pos)//3
        for vertex in (a, b, c):
            pos.extend(vertex)
        for normal in normals:
            nor.extend(normal)
        indices.extend((offset, offset + 1, offset + 2))

    def quad(self, mat, a, b, c, d, smooth=None):
        n = smooth
        self.triangle(mat, a, b, c, (n[0], n[1], n[2]) if n else None)
        self.triangle(mat, a, c, d, (n[0], n[2], n[3]) if n else None)

    def box(self, mat, center, width, height, depth, angle=0, tilt=0):
        right = (cos(angle), 0, -sin(angle))
        up = (-sin(tilt)*sin(angle), cos(tilt), -sin(tilt)*cos(angle))
        front = (cos(tilt)*sin(angle), sin(tilt), cos(tilt)*cos(angle))
        self.oriented_box(mat, center, right, up, front, width, height, depth)

    def oriented_box(self, mat, center, right, up, front, width, height, depth):
        p = [add(center, add(times(right,x*width/2), add(times(up,y*height/2), times(front,z*depth/2))))
             for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
        for corners in ((0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)):
            self.quad(mat, *(p[i] for i in corners))

    def panel(self, mat, vertices, depth):
        a,b,c,d = vertices
        normal = unit(cross(sub(b,a),sub(c,a)))
        back = [sub(p,times(normal,depth)) for p in vertices]
        self.quad(mat,a,b,c,d)
        self.quad(mat,*reversed(back))
        for i in range(4):
            j = (i+1) % 4
            self.quad(mat,vertices[j],vertices[i],back[i],back[j])

    def lathe(self, mat, profile, start=0, end=TAU, steps=72, inner=False):
        for (r1,y1),(r2,y2) in zip(profile, profile[1:]):
            for i in range(steps):
                a = start + (end-start)*i/steps
                b = start + (end-start)*(i+1)/steps
                outward = (y2-y1, r1-r2)
                def normal(angle):
                    return unit((sin(angle)*outward[0],outward[1],cos(angle)*outward[0]))
                vertices = (radial(r1,y1,a),radial(r1,y1,b),radial(r2,y2,b),radial(r2,y2,a))
                normals = (normal(a),normal(b),normal(b),normal(a))
                if inner:
                    self.quad(mat,*reversed(vertices),smooth=tuple(times(n,-1) for n in reversed(normals)))
                else:
                    self.quad(mat,*vertices,smooth=normals)

    def pipe(self, mat, start, end, r1, r2=None, sides=12, capped=True):
        axis = unit(sub(end,start))
        if r2 is None:
            r2 = r1
        u = unit(cross(axis, (0,0,1) if abs(axis[2]) < .89 else (0,1,0)))
        v = cross(axis,u)
        for i in range(sides):
            a,b = i*TAU/sides,(i+1)*TAU/sides
            n = add(times(u,cos(a)),times(v,sin(a)))
            m = add(times(u,cos(b)),times(v,sin(b)))
            p,q = add(start,times(n,r1)),add(start,times(m,r1))
            r,s = add(end,times(m,r2)),add(end,times(n,r2))
            d = max(1e-8,sqrt(dot(sub(end,start),sub(end,start))))
            n1,m1 = unit(add(n,times(axis,(r1-r2)/d))),unit(add(m,times(axis,(r1-r2)/d)))
            self.quad(mat,p,q,r,s,smooth=(n1,m1,m1,n1))
            if capped:
                self.triangle(mat,start,q,p,(times(axis,-1),)*3)
                self.triangle(mat,end,s,r,(axis,)*3)

    def line(self, mat, radius, *points):
        for a,b in zip(points,points[1:]):
            self.pipe(mat,a,b,radius,sides=8)

    def uv_sphere(self, mat, center, axes, sides=24, rings=16):
        def point(i, j):
            lat = pi * (i / rings - .5)
            az = TAU * j / sides
            direction = (sin(az)*cos(lat),sin(lat),cos(az)*cos(lat))
            return add(center,tuple(d*a for d,a in zip(direction,axes))),unit(tuple(d/a for d,a in zip(direction,axes)))
        for i in range(rings):
            for j in range(sides):
                corners = [point(i,j),point(i,j+1),point(i+1,j+1),point(i+1,j)]
                self.quad(mat,*(p for p,_ in corners),smooth=tuple(n for _,n in corners))

    def export(self, dest):
        stats = {"triangles": 0, "bounds": [[float("inf")]*3, [float("-inf")]*3]}
        data = bytearray()
        accessors, buffer_views = [], []

        def accessor(values, datatype, kind, bounds=None):
            while len(data)%4:
                data.append(0)
            code,target = ("I",34963) if datatype == 5125 else ("f",34962)
            binary = struct.pack(f"<{len(values)}{code}",*values)
            buffer_views.append({"buffer":0,"byteOffset":len(data),"byteLength":len(binary),"target":target})
            data.extend(binary)
            item = {"bufferView":len(buffer_views)-1,"componentType":datatype,"count":len(values)//(3 if kind=="VEC3" else 1),"type":kind}
            if bounds:
                item.update({"min":bounds[0],"max":bounds[1]})
            accessors.append(item)
            return len(accessors)-1

        def linear(hexcolor):
            srgb = [int(hexcolor[i:i+2],16)/255 for i in (1,3,5)]
            return [round((v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4),6) for v in srgb]+[1]

        primitives = defaultdict(list)
        for (name,mat),(pos,nor,indices) in self.batches.items():
            if not indices:
                continue
            bounds = [[min(pos[i::3]) for i in range(3)],[max(pos[i::3]) for i in range(3)]]
            for i in range(3):
                stats["bounds"][0][i] = min(stats["bounds"][0][i],bounds[0][i])
                stats["bounds"][1][i] = max(stats["bounds"][1][i],bounds[1][i])
            stats["triangles"] += len(indices)//3
            primitives[name].append({
                "attributes":{"POSITION":accessor(pos,5126,"VEC3",bounds),"NORMAL":accessor(nor,5126,"VEC3")},
                "indices":accessor(indices,5125,"SCALAR"),"material":list(PALETTE).index(mat),
            })
        doc = {
            "asset":{"version":"2.0","generator":"IGNIS procedural study model","copyright":"IGNIS. Geometry inspired by NASA Orion and ESA ESM public references."},
            "scene":0,"scenes":[{"nodes":list(range(len(primitives)))}],
            "nodes":[{"mesh":i,"name":name} for i,name in enumerate(primitives)],
            "meshes":[{"name":name,"primitives":items} for name,items in primitives.items()],
            "materials":[{"name":name,"doubleSided":True,"pbrMetallicRoughness":{
                "baseColorFactor":linear(color),"metallicFactor":metal,"roughnessFactor":rough},
                **({"emissiveFactor":[.09,.32,.42]} if name=="display" else {})
            } for name,(color,metal,rough) in PALETTE.items()],
            "accessors":accessors,"bufferViews":buffer_views,"buffers":[{"byteLength":len(data)}],
        }
        header = json.dumps(doc,separators=(",",":")).encode()
        header += b" "*(-len(header)%4)
        with dest.open("wb") as file:
            file.write(struct.pack("<4sIIII",b"glTF",2,28+len(header)+len(data),len(header),0x4E4F534A))
            file.write(header)
            file.write(struct.pack("<II",len(data),0x004E4942))
            file.write(data)
        print(dest.name, stats["triangles"], "triangles;", dest.stat().st_size, "bytes")


PROFILE = [(2.49,.19),(2.50,.36),(2.40,.60),(2.15,1.04),(1.88,1.49),
           (1.61,1.94),(1.35,2.39),(1.13,2.80),(1.08,3.00)]


def hull_radius(y):
    for (r1,y1),(r2,y2) in zip(PROFILE,PROFILE[1:]):
        if y1 <= y <= y2:
            return r1 + (r2-r1)*(y-y1)/(y2-y1)
    return PROFILE[0 if y < PROFILE[0][1] else -1][0]


def small_ring(model, mat, radius, y, height=.052, start=0, end=TAU):
    model.lathe(mat,[(radius-.03,y-height/2),(radius,y-height/2+.012),
                     (radius,y+height/2-.012),(radius-.03,y+height/2)],start,end,64)


def collar(model):
    model.group = "Túnel de acoplamiento y escotilla superior"
    model.lathe("shadow",[(1.13,2.80),(1.10,3.16),(.94,3.35),(.72,3.40),(.69,3.34)])
    model.lathe("hardware",[(1.02,3.03),(1.01,3.21),(.88,3.37),(.79,3.38)])
    model.lathe("steel",[(.80,3.32),(.81,3.43),(.72,3.52),(.65,3.52),(.65,3.38)])
    model.lathe("shadow",[(.65,3.32),(0,3.32)])
    small_ring(model,"titanium",.624,3.40,.065)
    small_ring(model,"ring",.77,3.465,.036)
    for i in range(24):
        a = i*TAU/24
        model.pipe("steel",radial(.738,3.48,a),radial(.738,3.527,a),.025,sides=6)
    for i in range(6):
        a = i*TAU/6
        model.box("titanium",radial(.65,3.365,a),.19,.085,.16,a)
    for a in (0,pi/2,pi,3*pi/2):
        model.box("silver-light",radial(.93,3.23,a),.29,.16,.17,a)


def heat_shield(model):
    model.group = "Escudo térmico y capa de Avcoat"
    def shield_height(r):
        return -.282 + .32 * (r/2.52)**2 + .014*(r/2.52)**5

    layout = [(0,6),(.32,12),(.63,18),(.98,24),(1.36,34),(1.73,42),(2.09,50)]
    edges = [r for r,_ in layout] + [2.51]
    substrate = [(r,shield_height(r)+.020) for r in edges]
    support = [(r,y+.035) for r,y in substrate]
    model.lathe("titanium",support+[(2.53,.19),(2.52,.29),(2.48,.38),(0,.38)],steps=144)
    model.lathe("edge",substrate,steps=144)
    small_ring(model,"shadow",2.539,.16,.13)
    small_ring(model,"steel",2.536,.25,.07)
    small_ring(model,"ring",2.527,.057,.037)
    rng = Random(21)
    ranges = [(r,edges[i+1],count) for i,(r,count) in enumerate(layout)]
    for ring,(r1,r2,count) in enumerate(ranges):
        start = .005 if r1 == 0 else r1 + .005
        end = r2 - .005
        middle = (start + end) / 2
        profile = [(r,shield_height(r)) for r in (start,middle,end)]
        for i in range(count):
            angle = (i+.5*(ring%2))*TAU/count
            mat = rng.choice(("avcoat","avcoat","avcoat","avcoat-light","avcoat-dark"))
            model.lathe(mat,profile,angle+.004,angle+TAU/count-.004,max(4,144//count))
    for i in range(4):
        a = pi/4 + i*pi/2
        center = radial(2.24,shield_height(2.24)-.013,a)
        model.pipe("edge",center,add(center,(0,-.027,0)),.195,sides=28)
        model.pipe("avcoat-light",add(center,(0,-.029,0)),add(center,(0,-.055,0)),.157,sides=24)
        model.pipe("titanium",add(center,(0,-.054,0)),add(center,(0,-.068,0)),.072,sides=12)
    for i in range(64):
        a=i*TAU/64
        model.pipe("hardware",radial(2.526,.27,a),radial(2.545,.27,a),.025,sides=8)


def capsule_exterior(model):
    model.group = "Carcasa térmica y paneles exteriores"
    model.lathe("shadow",[(max(.05,r-.035),y) for r,y in PROFILE],steps=112)
    rng = Random(17)
    heights = [.24,.36,.60,.82,1.04,1.265,1.49,1.715,1.94,2.165,2.39,2.595,2.80,3.0]
    for row,(low,high) in enumerate(zip(heights,heights[1:])):
        count = round(TAU*hull_radius((low+high)/2)/.23)
        for i in range(count):
            a = (i+.5*(row%2))*TAU/count
            mat = rng.choice(("silver","silver","silver","silver-light","silver-mid","silver-mid","silver-dark"))
            model.lathe(mat,[(hull_radius(low+.003)+.01,low+.003),(hull_radius(high-.003)+.01,high-.003)],
                        a+.003,a+TAU/count-.003,2)
    for y in (.36,1.04,1.94,2.8):
        small_ring(model,"hardware",hull_radius(y)+.023,y,.033)
    for a in (-1.40,.82,2.95):
        path=[radial(r+.026,y,a) for r,y in PROFILE[1:]]
        model.line("titanium",.018,*path)

    model.group = "Ventanas y cenefas"
    for a,y,width,height in [(-.64,2.06,.47,.44),(-.27,2.18,.38,.38),(.18,2.18,.38,.38),(.59,2.06,.47,.44)]:
        def window_coords(scale,offset):
            bottom,top = y-height*scale/2,y+height*scale/2
            spread = width*scale/2/hull_radius(y)
            return [radial(hull_radius(lev)+offset,lev,angle) for lev,angle in (
                (bottom,a-spread),(bottom,a+spread),(top,a+spread*.76),(top,a-spread*.76))]
        for material,scale,offset in [("shadow",1.21,.078),("hardware",1.0,.093),("shadow",.88,.106),("glass",.78,.118)]:
            model.panel(material,window_coords(scale,offset),.027)
        pts=window_coords(.73,.123)
        model.line("glass-glint",.01,pts[2],pts[3])
        for vertex in window_coords(1.03,.124):
            model.uv_sphere("steel",vertex,(.022,.022,.022),8,5)

    model.group = "Escotilla lateral y herrajes"
    a,y = .16,1.20
    def door(scale,offset):
        bottom,top=y-.53*scale,y+.53*scale
        spread=.40*scale/hull_radius(y)
        return [radial(hull_radius(lev)+offset,lev,angle) for lev,angle in (
            (bottom,a-spread),(bottom,a+spread),(top,a+spread),(top,a-spread))]
    for mat,scale,offset in [("shadow",1.12,.096),("titanium",1.03,.112),("silver-light",.93,.126)]:
        model.panel(mat,door(scale,offset),.04)
    rim = door(.86,.151)
    model.line("hardware",.02,*rim,rim[0])
    for dy in (-.34,.34):
        model.box("titanium",radial(hull_radius(y+dy)+.17,y+dy,a-.20),.17,.095,.115,a)
    for dy in (-.34,-.10,.11,.35):
        model.uv_sphere("steel",radial(hull_radius(y+dy)+.161,y+dy,a+.18),(.029,.027,.03),8,5)
    center = radial(hull_radius(y+.16)+.169,y+.16,a)
    normal = radial(.055,0,a)
    model.pipe("shadow",center,add(center,normal),.159,sides=24)
    model.pipe("glass",add(center,normal),add(center,times(normal,1.28)),.114,sides=20)
    model.box("shadow",radial(hull_radius(.98)+.19,.98,a+.1),.19,.09,.07,a)
    model.box("orange",radial(hull_radius(.98)+.235,.98,a+.1),.084,.04,.025,a)
    for i in range(9):
        a2 = .77+i*TAU/9
        r = hull_radius(.58)
        model.box("shadow",radial(r+.028,.58,a2),.26,.11,.092,a2)
        for j in (-1,0,1):
            model.pipe("titanium",radial(r+.07,.58+j*.021,a2),radial(r+.107,.58+j*.021,a2),.014,sides=10)
    collar(model)
    heat_shield(model)


def service_module(model):
    model.group = "Módulo europeo y paneles radiadores"
    model.lathe("shadow",[(0,-3.93),(1.63,-3.93),(1.98,-3.58),(1.99,-.86),(2.21,-.49),(2.36,-.09),(0,-.09)],steps=104)
    model.lathe("hardware",[(1.96,-3.58),(2.02,-3.50),(2.03,-.88),(2.14,-.65),(2.27,-.38),(2.38,-.10)],steps=104)
    rng = Random(28)
    for i in range(54):
        a = i*TAU/54
        mat = rng.choice(("foil","foil","foil-light","foil-dark"))
        for y0,y1 in ((-.67,-.50),(-.49,-.31),(-.3,-.12)):
            r0,r1 = 2.14+(y0+.65)*.44,2.14+(y1+.65)*.44
            r0 += rng.uniform(-.016,.016)
            model.lathe(mat,[(r0,y0),(r1,y1)],a+.004,a+TAU/54-.005,2)
    for i in range(6):
        a = i*TAU/6
        sections = ((-3.45,-.90),) if i < 4 else ((-3.45,-2.30),(-2.18,-.90))
        for low,high in sections:
            model.lathe("shadow",[(2.045,low),(2.045,high)],a-.478,a+.478,24)
            for j in range(12):
                x = a-.46+j*.92/12
                mat = "radiator" if (j+i)%4 else "ceramic"
                model.lathe(mat,[(2.069,low+.025),(2.069,high-.025)],x+.002,x+.92/12-.002,4)
        for h in (-3.39,-2.87,-2.33,-1.81,-1.28,-.94):
            model.lathe("hardware",[(2.076,h),(2.076,h+.023)],a-.464,a+.464,15)
        for y in (-3.30,-1.04):
            for j in (-.41,.41):
                model.box("shadow",radial(2.077,y,a+j),.13,.08,.025,a+j)
    for y,r in ((-.10,2.37),(-.77,2.206),(-.9,2.077),(-3.48,2.064),(-3.66,1.91)):
        small_ring(model,"steel" if y > -.85 else "titanium",r,y,.078)
    for i in range(28):
        a = i*TAU/28
        model.pipe("shadow",radial(2.043,-3.52,a),radial(2.073,-3.52,a),.022,sides=6)
    for i in range(8):
        a = i*TAU/8
        model.box("shadow",radial(2.079,-2.73,a),.29,.33,.17,a)
        model.box("silver-mid",radial(2.182,-2.73,a),.20,.27,.045,a)
        model.line("ring",.017,radial(2.08,-3.25,a),radial(2.15,-3.12,a),radial(2.15,-2.89,a))

    model.group = "Base de servicio"
    model.lathe("shadow",[(0,-4.49),(.77,-4.49),(.79,-4.38),(.59,-4.17),(.43,-4.01),(.38,-3.71)],steps=52)
    model.lathe("titanium",[(.82,-4.49),(.83,-4.42),(.64,-4.19),(.43,-3.96),(.40,-3.72)],steps=52)
    model.lathe("carbon",[(.79,-4.491),(.51,-4.40),(.23,-4.18),(.10,-4.12)],steps=52,inner=True)
    small_ring(model,"hardware",.845,-4.44,.035)
    for i in range(8):
        a = i*TAU/8
        base = radial(1.38,-3.68,a)
        lower = radial(1.57,-4.03,a)
        model.pipe("titanium",base,lower,.088,.155,16,False)
        model.pipe("shadow",lower,add(lower,(0,-.026,0)),.142,.13,16,True)
        model.line("foil",.026,radial(1.17,-3.70,a),radial(1.24,-3.77,a),base)

    model.group = "Alas fotovoltaicas y bisagras"
    for wing in range(4):
        a = .27 + wing*pi/2
        out = radial(1,0,a)
        span = (cos(a),0,-sin(a))
        origin=(0,-2.32,0)
        def at(r,x,h=0):
            return add(origin,add(times(out,r),add(times(span,x),(0,h,0))))
        model.pipe("shadow",at(1.98,0),at(2.60,0),.235,.17,sides=20)
        model.pipe("steel",at(2.15,0),at(2.37,0),.259,sides=20)
        model.line("hardware",.063,at(2.55,0),at(3.37,0,.31))
        for j in (-1,1):
            model.line("titanium",.041,at(2.42,j*.19),at(3.06,j*.68,.21),at(3.42,j*.72,.29))
        for panel in range(3):
            r0=3.29+panel*2.069
            r1=r0+2.005
            h=.30+panel*.139
            slope=.058
            surface = unit(add(out,(0,slope,0)))
            upward = unit(cross(surface,span))
            def panel_at(r,x,offset=0):
                return add(at(r,x,h+(r-r0)*slope),times(upward,offset))
            center=(r0+r1)/2
            model.oriented_box("carbon",panel_at(center,0),span,surface,upward,1.89,2.005,.065)
            model.oriented_box("blue-cell",panel_at(center,0,.043),span,surface,upward,1.80,1.94,.02)
            for row in range(16):
                for column in range(11):
                    xr = (column-5)*.156
                    along = r0+.11+row*.118
                    tone = rng.choice(("blue-cell","blue-mid","blue-mid","blue-light")) if (column+row)%3 else "blue-cell"
                    model.oriented_box(tone,panel_at(along,xr,.061),span,surface,upward,.145,.109,.008)
            for x in (-.941,.941):
                model.line("hardware",.021,panel_at(r0,x),panel_at(r1,x))
            for rv in (r0,r1):
                model.line("hardware",.024,panel_at(rv,-.942),panel_at(rv,.942))
            for x in (-.67,.67):
                model.pipe("foil",panel_at(r1,x),panel_at(r1+.095,x),.039,sides=10)


def cabin_cutaway(model):
    start,end = .96,TAU-.96
    model.group = "Casco presurizado y capas del corte"
    inside = [(r-.12,y+.035) for r,y in PROFILE]
    model.lathe("shadow",[(r-.045,y+.012) for r,y in PROFILE],start,end,92)
    model.lathe("titanium",[(r+.005,y) for r,y in PROFILE],start,end,92)
    model.lathe("insulation",inside,start,end,92,inner=True)
    for a in (start,end):
        for (r1,y1),(r2,y2) in zip(PROFILE,PROFILE[1:]):
            model.quad("ring",radial(r1+.006,y1,a),radial(r2+.006,y2,a),
                       radial(r2-.12,y2+.035,a),radial(r1-.12,y1+.035,a))
    for y in (.38,.70,1.21,1.72,2.24,2.77):
        r=hull_radius(y)-.12
        small_ring(model,"hardware",r+.025,y,.057,start,end)
        small_ring(model,"silver-light",r-.052,y,.050,start,end)
    for i in range(13):
        a=start+(end-start)*i/12
        model.line("hardware",.034,*(radial(r-.18,y+.025,a) for r,y in PROFILE))
        if i in (0,12):
            model.line("ring",.024,*(radial(r+.025,y,a) for r,y in PROFILE))
    model.lathe("carbon",[(0,.14),(2.44,.14),(2.47,.22),(2.44,.43),(0,.43)],steps=92)
    small_ring(model,"steel",2.466,.34,.085)
    for i in range(4):
        begin=-1.95+i*.97
        end_floor=begin+.93
        for j in range(7):
            low=-1.90+j*.54
            high=low+.51
            if max(begin**2,end_floor**2)+max(low**2,high**2)<=2.28**2:
                model.box("titanium" if (i+j)%2 else "shadow",((begin+end_floor)/2,.432,(low+high)/2),.923,.013,.505)
    for i in range(7):
        x = (i-3)*.53
        zmax = sqrt(2.34**2-x*x)
        model.line("hardware",.013,(x,.447,-zmax),(x,.447,zmax))
    for i in range(10):
        z = (i-4.5)*.38
        xmax=sqrt(2.32**2-z*z)
        model.line("hardware",.012,(-xmax,.446,z),(xmax,.446,z))
    model.lathe("hardware",[(1.15,2.79),(1.10,2.98),(.88,3.20),(.70,3.23),(.64,3.16)],
                start,end,64)
    small_ring(model,"steel",.70,3.16,.058,start,end)
    for a in (1.09,1.53,4.86,5.24):
        model.line("ring",.024,radial(2.11,.48,a),radial(1.39,1.8,a),radial(.81,2.85,a))

    def console_rack(center, width, height, depth, angle=0):
        model.box("shadow",center,width,height,depth,angle)
        x,y,z=center
        for k in range(5):
            h=y+(k-2)*height*.17
            front=add((x,h,z),radial(depth*.53,0,angle))
            model.box("hardware",front,width*.89,height*.125,.040,angle)
            for j in range(6):
                p=add(front,((j-2.5)*width*.12*cos(angle),0,-(j-2.5)*width*.12*sin(angle)))
                model.box("shadow",add(p,radial(.026,0,angle)),width*.063,height*.045,.015,angle)
            model.box("cyan" if k % 2 else "green",add(front,(-width*.37*cos(angle),0,width*.37*sin(angle))),.027,.028,.052,angle)

    model.group = "Aviónica y consolas"
    for i in (-1,0,1):
        center=(i*.49,2.05,-.971)
        model.box("shadow",center,.48,.39,.11,tilt=-.24)
        model.box("hardware",(i*.49,2.05,-.895),.45,.34,.048,tilt=-.24)
        model.box("screen",(i*.49,2.064,-.859),.396,.273,.036,tilt=-.24)
        for j in range(3):
            model.box("display",(i*.49+(.045*(j%2)),2.023+.041*j,-.829-.008*j),.23-.028*j,.011,.01)
        for j in range(7):
            model.box("cyan",(i*.49+(j-3)*.047,1.927,-.843),.025,.025,.016)
    model.box("titanium",(0,1.78,-.991),1.55,.16,.24,tilt=-.24)
    for i in range(21):
        model.box("white",((i-10)*.063,1.81,-.844),.025,.038,.017)
    console_rack((1.33,.94,-.36),.48,.81,.38,-.68)
    console_rack((1.10,.87,-.94),.45,.64,.32,-.24)

    model.group = "Asientos, anclajes y arneses"
    for seat_x,seat_z in ((-.84,-.50),(-.29,-.50),(.30,.33),(.85,.33)):
        s=(seat_x,.73,seat_z)
        model.box("hardware",add(s,(0,-.13,0)),.42,.11,.65)
        model.box("padding",s,.445,.135,.62,tilt=.08)
        model.box("upholstery",add(s,(0,.069,-.025)),.375,.063,.48)
        model.box("steel",add(s,(0,.40,.27)),.44,.72,.098,tilt=-.30)
        model.box("padding",add(s,(0,.39,.214)),.397,.64,.115,tilt=-.30)
        model.box("upholstery",add(s,(0,.42,.147)),.322,.51,.058,tilt=-.30)
        model.box("upholstery",add(s,(0,.75,.22)),.255,.203,.102,tilt=-.30)
        model.box("shadow",add(s,(0,.765,.158)),.229,.14,.059,tilt=-.30)
        for side in (-1,1):
            x=seat_x+side*.19
            model.line("hardware",.025,(x,.48,seat_z-.35),(x,.66,seat_z-.30),(x,.67,seat_z+.28),(x,.47,seat_z+.36))
            model.line("strap",.022,(seat_x+side*.115,1.30,seat_z+.14),
                       (seat_x+side*.092,1.063,seat_z+.113),(seat_x+side*.038,.85,seat_z+.02))
            model.line("strap",.022,(x,.79,seat_z+.09),(seat_x,.855,seat_z+.022))
        model.box("steel",add(s,(0,.132,.013)),.083,.052,.07)

    model.group = "Bolsas y compartimentos de estiba"
    for a in (1.91,2.31,3.82,4.19):
        for y in (.74,1.21):
            r=hull_radius(y)-.29
            c=radial(r,y,a)
            model.box("hardware",c,.42,.38,.29,a)
            inside_face=radial(r-.166,y,a)
            model.box("upholstery",inside_face,.38,.335,.088,a)
            for x in (-.114,.114):
                p=add(inside_face,(x*cos(a),0,-x*sin(a)))
                model.box("strap",add(p,radial(-.052,0,a)),.024,.318,.015,a)
            model.box("white",add(inside_face,radial(-.052,.062,a)),.11,.055,.014,a)

    model.group = "Ventilación, retorno y sensores de cabina"
    console_rack((-1.36,1.12,-.51),.46,.91,.43,.61)
    for i in (-1,1):
        points=[(i*1.53,.91,-.64),(i*1.51,1.35,-.78),(i*1.27,1.88,-.77),(i*.96,2.45,-.62),(i*.64,2.77,-.45)]
        model.line("coolant",.085,*points)
        for p in points[1:]:
            model.uv_sphere("coolant",p,(.086,.086,.086),12,8)
        for y in (1.33,1.87,2.40):
            model.box("steel",(i*(1.72-y*.36),y,-.65),.21,.096,.22)
    for px,py,pz in [(-1.28,1.86,-.59),(.76,2.51,-.59)]:
        model.box("shadow",(px,py,pz),.26,.15,.12)
        model.box("cyan",(px,py,pz+.068),.193,.094,.024)
        for i in range(6):
            model.box("screen",(px+(i-2.5)*.026,py,pz+.083),.012,.063,.008)
        model.uv_sphere("green",(px+.10,py+.039,pz+.089),(.013,.013,.013),8,5)
    for i in range(4):
        x=-.81+i*.54
        model.line("cyan",.029,(x,2.56,-.93),(x,2.73,-.81),(x*.8,2.99,-.50))

    model.group = "Extintor y equipos de respuesta"
    at=(-1.64,.94,.52)
    model.pipe("red",add(at,(0,-.30,0)),add(at,(0,.31,0)),.168,sides=24)
    for y in (-.28,.30):
        model.uv_sphere("red",add(at,(0,y,0)),(.167,.113,.167),18,9)
    model.pipe("hardware",add(at,(0,.33,0)),add(at,(0,.49,0)),.061,sides=16)
    model.box("shadow",add(at,(.006,.491,0)),.21,.063,.076)
    model.box("orange",add(at,(.006,.531,0)),.19,.038,.065)
    model.line("shadow",.032,add(at,(.07,.49,.02)),add(at,(.22,.48,.15)),add(at,(.24,.27,.19)),add(at,(.065,.20,.18)))
    model.box("white",add(at,(0,-.027,.165)),.172,.119,.011)
    model.box("shadow",add(at,(0,-.115,.164)),.212,.06,.06)
    for y in (.58,.70,.82):
        model.box("white",(1.61,y,.54),.335,.113,.31,-.28)
        model.box("orange",(1.62,y,.70),.078,.037,.018,-.28)

    model.group = "Canalización eléctrica y compartimentos"
    for offset in (-.045,0,.045):
        model.line("foil-light",.022,(1.38+offset,.67,+.53),(1.61+offset,.91,.51),
                   (1.57+offset,1.21,.25),(1.31+offset,1.50,-.35),(1.16+offset,1.59,-.78))
    for i in range(4):
        y=.59+i*.175
        model.box("shadow",(1.68,y,.53),.35,.10,.239,-.38)
        model.box("hardware",(1.62,y,.65),.313,.077,.037,-.38)
        for j in (-1,0,1):
            model.box("shadow",(1.62+j*.072,y,.677),.033,.036,.012)
    for x in (-1.82,1.84):
        model.line("ring",.025,(x,.51,.54),(x*.94,1.0,.58),(x*.82,1.55,.58))


if __name__ == "__main__":
    flight = Model()
    capsule_exterior(flight)
    service_module(flight)
    flight.export(OUTPUT / "orion-flight.glb")
    cabin = Model()
    cabin_cutaway(cabin)
    cabin.export(OUTPUT / "orion-cabin.glb")
    entry = Model()
    capsule_exterior(entry)
    entry.export(OUTPUT / "orion-entry.glb")
