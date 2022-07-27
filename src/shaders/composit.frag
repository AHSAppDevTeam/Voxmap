uniform highp sampler2D u_diffuse;
uniform highp sampler2D u_reflection;

in vec2 v_texCoord;
out vec3 c_out;

void main() {
  if(v_texCoord.x < 0.5) {
    c_out = texture(u_diffuse, v_texCoord).rgb;
  } else {
    c_out = texture(u_reflection, v_texCoord).rgb;
  }
  return;
  vec3 diffuseCol = texture(u_diffuse, v_texCoord).rgb;
  vec2 reflectUV = texture(u_reflection, v_texCoord).rg;
  vec3 reflectCol = texture(u_diffuse, reflectUV).rgb;
  c_out = mix(diffuseCol, reflectCol, 0.5);
}
