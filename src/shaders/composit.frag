uniform highp sampler2D u_diffuse;
uniform highp sampler2D u_reflection;

in vec2 v_texCoord;
out vec4 FragColor;

void main() {
  FragColor = vec4(texture(u_diffuse, v_texCoord).rgb, 1.0);
  FragColor.rg = v_texCoord;
}
