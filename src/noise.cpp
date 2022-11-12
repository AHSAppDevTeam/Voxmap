#include "voxmap.h"
#include "OpenSimplexNoise/OpenSimplexNoise.h"
#include <math.h>
#include <fstream>
#include <iostream>

OpenSimplexNoise::Noise noise;
std::ofstream o_noise("out/noise.bin", std::ios::binary);

const float TAU = 6.28318530718;

auto simplex = [](int x, int y, int o, double n)
{
	double r = 0.5;
	double a = TAU * x / (X >> o);
	double b = TAU * y / (X >> o);
	return noise.eval(
			r * cos(a),
			r * sin(a),
			r * cos(b),
			r * sin(b)
			);
};
auto fractal = [](int x, int y, int octaves)
{
	double n = 0;
	for(int o = 0; o < octaves; o++){
		n += simplex(x, y, o, n) / (1 << o);
	}
	return 128 + std::clamp((int)(300 * n), -128, 127);
};

int main() {
	for(int x = 0; x < X; x++)
	for(int y = 0; y < X; y++)
	{
		int n = std::rand() % 256;
		double f = n/128.0 - 1.0;
		o_noise.put((char) n);
		o_noise.put((char) fractal(x, y, 10));
		o_noise.put((char) (int) (128.0 * (cos(f) + 1.0)));
		o_noise.put((char) (int) (128.0 * (sin(f) + 1.0)));
	}
	o_noise.close();
}
