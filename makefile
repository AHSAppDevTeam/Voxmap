.PHONY: all encrypted clean

all: out/noise.bin.gz out/vertex.bin.gz out/map.bin.gz

encrypted: res/noise.blob res/vertex.blob res/map.blob

### Maps
maps:
	mkdir maps/

maps/map.csv:
	### (MANUAL STEP) data collection

maps/map.svg: maps/map.csv
	### rough location maps to SVG
	python3 src/gen/csv-pass.py

maps/old.map.ora: maps/map.svg
	### SVG to rastered Krita file containing depth and edges
	mkdir -p maps/ora/maps
	# rasterize depth map
	convert -flip +antialias maps/map.svg maps/ora/data/layer0.png
	# get edges
	convert -threshold 0 -edge 1 +antialias maps/ora/data/layer0.png maps/ora/data/layer1.png
	# zip into .ora
	cd maps/ora && zip -r map.ora * && cd ..
	mv maps/ora/map.ora maps/out.map.ora

maps/map.ora:
	### (MANUAL STEP) clean up data in Krita

maps/map.pgm: maps/map.ora
	### Krita file to easily-parsable greyscale PGM
	unzip -o maps/map.ora -d maps/ora
	mogrify -format pgm -flip maps/ora/data/*.png
	mkdir -p maps/pgm
	mv maps/ora/data/*.pgm maps/pgm
	touch maps/pgm/*.pgm

maps/map.old.vox: bin/vox maps/map.pgm
	### PGM to 3D MagicaVoxel volume
	bin/vox

maps/map.txt: maps/map.vox
	### MagicaVoxel to Goxel text format
	### x y z RRGGBB
	goxel $^ --export $@

## Javascript-readable files
out:
	mkdir out/

out/noise.bin: bin/noise | out
	bin/noise

out/vertex.bin out/map.bin: bin/sdf maps/map.txt | out
	### PBM to SDF and vertices
	# results in a combined SDF + voxel color texture
	bin/sdf

out/noise.bin.gz: out/noise.bin
	gzip < $^ > $@

out/vertex.bin.gz: out/vertex.bin
	gzip < $^ > $@

out/map.bin.gz: out/map.bin
	gzip < $^ > $@

### Encrypted

res/noise.blob res/vertex.blob res/map.blob: src/gen/encrypt.js \
	out/noise.bin.gz out/vertex.bin.gz out/map.bin.gz
	### Encrypt
	nvm use latest
	node src/gen/encrypt.js

### C++ compilation

cppflags = -O3 -g -std=c++20 -Ilibs/MagicaVoxel_file_writer -Ilibs/OpenSimplexNoise -I.

bin:
	mkdir bin/

bin/OpenSimplexNoise.o: | bin
	clang++ $(cppflags) -o $@ -c libs/OpenSimplexNoise/OpenSimplexNoise/OpenSimplexNoise.cpp

bin/VoxWriter.o: | bin
	clang++ $(cppflags) -o $@ -c libs/MagicaVoxel_File_Writer/VoxWriter.cpp

bin/moxel: src/gen/moxel.cpp bin/VoxWriter.o | bin
	clang++ $(cppflags) $^ -o $@

bin/reverse-moxel: src/gen/reverse-moxel.cpp bin/VoxWriter.o | bin
	clang++ $(cppflags) $^ -o $@

bin/noise: src/gen/noise.cpp bin/OpenSimplexNoise.o | bin
	clang++ $(cppflags) $^ -o $@

bin/sdf: src/gen/sdf.cpp | bin
	clang++ $(cppflags) $^ -ltbb -o $@

bin/viewer: src/gen/viewer.cpp libs/glad.c | bin
	clang++ $^ -ldl -lglfw $(cppflags) -o $@
