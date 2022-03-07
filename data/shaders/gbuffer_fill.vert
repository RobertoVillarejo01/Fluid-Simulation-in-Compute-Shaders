#version 430

layout (location = 0) in vec3 mPos;
layout (location = 1) in vec3 mVtxNormal;
layout (location = 2) in vec4 mTangents;
layout (location = 3) in vec2 mUVs;

layout (location = 0) uniform mat4 Model2Proj;
layout (location = 1) uniform mat4 Model2View;
layout (location = 2) uniform mat4 NormalsM2V;

out vec2 uvs;
out vec3 mNormal;
out vec3 mFragPos;

void main()
{
    gl_Position = Model2Proj * vec4(mPos, 1);
    mFragPos    = vec3(Model2View * vec4(mPos, 1));
    mNormal     = mat3(NormalsM2V) * mVtxNormal;
    uvs         = mUVs;
}