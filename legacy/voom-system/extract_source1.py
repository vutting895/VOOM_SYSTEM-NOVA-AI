import pathlib, re, urllib.request, ssl
url = "https://1384489044754065.a.metaaiusercontent.com/html?artifact_uuid=ea48fb86-3962-4710-8de2-72aef8a71847&ext=1792828800&hash=Q5fpDAHL9GE2GKEia1jAQ7tQEBtF"
ctx = ssl._create_unverified_context()
req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
html = urllib.request.urlopen(req, context=ctx, timeout=30).read().decode("utf-8", "replace")
out = pathlib.Path(r"C:\\Users\\Administrator\\Documents\\Voom_system\\Source1_Extracted")
out.mkdir(parents=True, exist_ok=True)
(out / "export-code-system.html").write_text(html, encoding="utf-8")
pat = re.compile(r'filename:"([^\"]+)",lang:"([^\"]+)",size:"([^\"]+)",desc_en:".*?",desc_th:".*?",code:`(.*?)`}', re.S)
found=[]
for m in pat.finditer(html):
 name, lang, size, code = m.groups()
 if pathlib.PurePosixPath(name).name != name or ".." in name: continue
 (out / name).write_text(code, encoding="utf-8")
 found.append({"filename":name,"lang":lang,"declared_size":size,"actual_chars":len(code)})
print({"html_bytes":len(html.encode()),"extracted_count":len(found),"files":found})
