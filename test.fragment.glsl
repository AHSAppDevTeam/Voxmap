#version 330 core
precision highp float;

in vec3 v_color;

void main() {
  gl_FragColor = vec4(v_color, 1);
}
