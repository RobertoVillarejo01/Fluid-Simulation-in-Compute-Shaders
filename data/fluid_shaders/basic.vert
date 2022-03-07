#version 430

layout (location = 0) in vec3 aPos;    // [-0.5, 0.5]

layout (location = 1) in vec3 iPos;
layout (location = 2) in vec3 iColor;

layout (location = 0) uniform mat4 World2Proj;
layout (location = 1) uniform mat4 World2View; 
layout (location = 2) uniform float mScale; 

out vec2 uvs;

void main()
{
    // Extract the necessary vectors from the camera mtx
    vec3 CamRightVec = normalize(vec3(World2View[0][0], World2View[1][0], World2View[2][0]));
    vec3 CamUpVec    = normalize(vec3(World2View[0][1], World2View[1][1], World2View[2][1]));
  
    // Multiply the respective coordinate by the vectors of the camera or the standar ones, depending
    // on the billboarding for said axis being active
    vec3 h_bill = CamRightVec;
    vec3 v_bill = CamUpVec;
    
    // Get the final rotated version of the model space vtx and scale it appropiately
    vec3 Rotated = h_bill * aPos.x + v_bill * aPos.y;
    Rotated *= mScale;
 
    // Finally apply world to proj transforms to the rotated model
    gl_Position = World2Proj * vec4(Rotated + iPos, 1.0);


    // Compute the UVs basec on the original Vtx Pos
    uvs = 2*aPos.xy;
}