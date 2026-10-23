async function request(path,method='GET',body) {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-Yingci-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'本机保存未完成。');
  return data;
}
export function saveProject(project){return request(`/api/projects/${project.id}`,'PUT',project);}
export function listProjects(){return request('/api/projects');}
export function loadProject(id){return request(`/api/projects/${id}`);}
export function deleteProject(id){return request(`/api/projects/${id}`,'DELETE');}
