const int X = 1024;
const int Y = 256;
const int Z = 16;

const int LEN[3] = { X, Y, Z };
const int AREA[3] = { Y*Z, X*Z, X*Y };

#define FOR_ZYX \
for(int z = 0; z < Z; z++) \
for(int y = 0; y < Y; y++) \
for(int x = 0; x < X; x++)

#define FOR_XZY \
for(int x = 0; x < X; x++) \
for(int z = 0; z < Z; z++) \
for(int y = 0; y < Y; y++)

#define FOR_YXZ \
for(int y = 0; y < Y; y++) \
for(int x = 0; x < X; x++) \
for(int z = 0; z < Z; z++)

