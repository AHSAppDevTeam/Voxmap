width = 1024
height = 512 

space = " "
comma = ","

out = [ 
    f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">',
    '<rect width="100%" height="100%"/>'
]

points = []

with open('maps/map.csv') as filein:
  for line in reversed(filein.readlines()):
    x, y = line.split(comma)
    if x.startswith('-'):
      depth = int(x[1:]) * 8
      color = hex(depth)[2:].zfill(2) * 3
      out.append(f'<polygon points="{space.join(points)}" fill="#{color}"/>')
      points = []
    else:
      points.append(x)
      points.append(y)

out.append('</svg>')

with open('out.svg', 'w') as fileout:
  fileout.writelines(out)
