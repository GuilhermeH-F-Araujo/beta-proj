from PIL import Image,ImageOps,ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=sorted((root/'out/qc').glob('*.png'))
sheet=Image.new('RGB',(270*len(files),510),'#252830')
for i,p in enumerate(files):
    img=Image.open(p).convert('RGB');img.thumbnail((270,480))
    sheet.paste(img,(i*270,0));ImageDraw.Draw(sheet).text((i*270+10,487),p.stem,fill='white')
sheet.save(root/'out/contact-sheet.jpg')
print(root/'out/contact-sheet.jpg')
