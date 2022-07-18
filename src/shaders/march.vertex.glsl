#version 330 core
precision highp float;

in vec3 aPos;

void main() {
	gl_Position = vec4(aPos, 1.0);
}
