#version 430

in  vec2 uvs;
out vec4 outColor;

void main()
{
    float r2 = dot(uvs, uvs);
    if (r2 > 1.0) discard;
    
    outColor = vec4(uvs, 0.8, 1);
}
