from pathlib import Path
import re, html, json
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, Flowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from pypdf import PdfReader
from PIL import Image as PILImage, ImageOps, ImageDraw
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
TMP=ROOT/'tmp/pdfs'; TMP.mkdir(parents=True,exist_ok=True)
for n,f in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf'),('Arial-Italic','ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(n,'C:/Windows/Fonts/'+f))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial-Italic',boldItalic='Arial-Bold')
NAVY=colors.HexColor('#13283E'); BLUE=colors.HexColor('#265BD9'); TEAL=colors.HexColor('#008879'); LIGHT=colors.HexColor('#EEF4FA'); INK=colors.HexColor('#25384C'); MUTED=colors.HexColor('#62758A')
W,H=595.276,841.89; CW=W-88
S={
 'body':ParagraphStyle('body',fontName='Arial',fontSize=10.5,leading=15,textColor=INK,spaceAfter=8),
 'h':ParagraphStyle('h',fontName='Arial-Bold',fontSize=21,leading=26,textColor=NAVY,spaceAfter=16),
 'sub':ParagraphStyle('sub',fontName='Arial-Bold',fontSize=11,leading=15,textColor=TEAL,spaceBefore=6,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Arial',fontSize=8,leading=11.5,textColor=MUTED,spaceAfter=8),
 'cell':ParagraphStyle('cell',fontName='Arial',fontSize=9.5,leading=13,textColor=INK),
 'head':ParagraphStyle('head',fontName='Arial-Bold',fontSize=9,leading=12,textColor=colors.white),
 'white':ParagraphStyle('white',fontName='Arial-Bold',fontSize=35,leading=42,textColor=colors.white),
}

def clean(s):
    return s.replace('—','-').replace('–','-').replace('\u2011','-')
def markup(s):
    s=html.escape(clean(s))
    return re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
def p(s,style='body'): return Paragraph(markup(s),S[style])

TEXT={
'uz':dict(file='qollanma-uz-lotin.md',out='Zavodlar-yoriqnoma-UZ-lotin.pdf',lang='O‘ZBEKCHA / LOTIN',title='Zavodlar\nish stoli',subtitle='Rasmli foydalanish yo‘riqnomasi',intro='Kirishdan hisobotgacha - xodimlar uchun amaliy qo‘llanma.',contents='Yo‘riqnoma xaritasi',screens='Ekran bilan tanishing',daily='Kunlik hisobot: ekran bo‘yicha',note='Rasmlar loyihadagi sinov ekranlaridan olingan. Ulardagi sana va raqamlar namuna; amaldagi hisobot emas. Ekran yozuvlari asl holida qoldirilgan.',tips=['Zavod va sanani tekshiring','Reja, fakt va brakni farqlang','Saqlangan holatini tekshiring'],flow=['Tayyorlash','Rejalash','Ishlab chiqarish','Jo‘natish','Tekshirish'],foot='FOYDALANISH YO‘RIQNOMASI',finish='Har kuni bir xil tartib',mobile='Telefon va xabarnomalar',sample='MISOL',calc='30 dona reja  /  25 dona sifatli fakt  /  1 dona brak',calcnote='Bajarilish: 25 ÷ 30 × 100 ≈ 83%. Brak alohida kiritiladi.',legend=['1  Zavod tanlagichi va menyu','2  Hisobot sanasi','3  Saqlash tugmasi va holat','4  Reja, sifatli fakt va brak ustunlari'],overview='Umumiy panel: bir nechta zavod natijalarini ko‘rish.',roles='Vazifalar va huquqlar',ready='Ishni tayyorlash va ombor',orders='Buyurtma va reja',prod='Kunlik ishlab chiqarish',ship='Jo‘natish va qoldiq',reports='Hisobot va hisob-kitob',admin='Zaxira va muammolar'),
'kr':dict(file='qollanma-uz-kirill.md',out='Zavodlar-yoriqnoma-UZ-kirill.pdf',lang='ЎЗБЕКЧА / КИРИЛЛ',title='Заводлар\nиш столи',subtitle='Расмли фойдаланиш йўриқномаси',intro='Киришдан ҳисоботгача - ходимлар учун амалий қўлланма.',contents='Йўриқнома харитаси',screens='Экран билан танишинг',daily='Кунлик ҳисобот: экран бўйича',note='Расмлар лойиҳадаги синов экранларидан олинган. Улардаги сана ва рақамлар намуна; амалдаги ҳисобот эмас. Экран ёзувлари асл ҳолида қолдирилган.',tips=['Завод ва санани текширинг','Режа, факт ва бракни фарқланг','Сақланган ҳолатини текширинг'],flow=['Тайёрлаш','Режалаш','Ишлаб чиқариш','Жўнатиш','Текшириш'],foot='ФОЙДАЛАНИШ ЙЎРИҚНОМАСИ',finish='Ҳар куни бир хил тартиб',mobile='Телефон ва хабарномалар',sample='МИСОЛ',calc='30 дона режа  /  25 дона сифатли факт  /  1 дона брак',calcnote='Бажарилиш: 25 ÷ 30 × 100 ≈ 83%. Брак алоҳида киритилади.',legend=['1  Завод танлагичи ва меню','2  Ҳисобот санаси','3  Сақлаш тугмаси ва ҳолат','4  Режа, сифатли факт ва брак устунлари'],overview='Умумий панель: бир нечта завод натижаларини кўриш.',roles='Вазифалар ва ҳуқуқлар',ready='Ишни тайёрлаш ва омбор',orders='Буюртма ва режа',prod='Кунлик ишлаб чиқариш',ship='Жўнатиш ва қолдиқ',reports='Ҳисобот ва ҳисоб-китоб',admin='Захира ва муаммолар'),
'ru':dict(file='rukovodstvo-ru.md',out='Zavodlar-rukovodstvo-RU.pdf',lang='РУССКИЙ',title='Рабочий стол\nзавода',subtitle='Иллюстрированное руководство',intro='От входа до отчёта - практическое пособие для сотрудников.',contents='Карта руководства',screens='Знакомство с экраном',daily='Ежедневный отчёт: по экрану',note='Использованы сохранённые тестовые экраны проекта. Даты и числа приведены для примера и не являются текущим отчётом. Надписи на снимках сохранены в исходном виде.',tips=['Проверьте завод и дату','Различайте план, факт и брак','Проверьте статус сохранения'],flow=['Подготовка','Планирование','Производство','Отгрузка','Проверка'],foot='РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ',finish='Единый порядок на каждый день',mobile='Телефон и уведомления',sample='ПРИМЕР',calc='30 шт. план  /  25 шт. годный факт  /  1 шт. брак',calcnote='Выполнение: 25 ÷ 30 × 100 ≈ 83%. Брак указывается отдельно.',legend=['1  Выбор завода и меню','2  Дата отчёта','3  Сохранение и его статус','4  План, годный факт и брак'],overview='Общая панель: просмотр результатов нескольких заводов.',roles='Задачи и права',ready='Подготовка и склад',orders='Заказы и план',prod='Ежедневное производство',ship='Отгрузка и остатки',reports='Отчёты и расчёты',admin='Резервные копии и проблемы')}

class Workflow(Flowable):
    def __init__(self,labels): super().__init__(); self.width=CW; self.height=96; self.labels=labels
    def draw(self):
        c=self.canv; bw=(CW-32)/5
        for i,t in enumerate(self.labels):
            x=i*(bw+8); c.setFillColor(LIGHT); c.roundRect(x,15,bw,73,7,fill=1,stroke=0)
            c.setFillColor(TEAL); c.circle(x+16,69,9,fill=1,stroke=0)
            c.setFillColor(colors.white); c.setFont('Arial-Bold',8); c.drawCentredString(x+16,66,str(i+1))
            q=Paragraph(markup(t),ParagraphStyle('flow',fontName='Arial-Bold',fontSize=8,leading=11,textColor=NAVY))
            q.wrap(bw-14,38); q.drawOn(c,x+7,28)
            if i<4:
                c.setStrokeColor(TEAL); c.line(x+bw+1,50,x+bw+7,50)

class Shot(Flowable):
    def __init__(self,path,width=CW,points=None):
        super().__init__(); self.path=str(path); im=PILImage.open(path); self.width=width; self.height=width*im.height/im.width; self.points=points or []
    def draw(self):
        c=self.canv; c.drawImage(self.path,0,0,width=self.width,height=self.height)
        for n,x,y in self.points:
            xx=x*self.width; yy=(1-y)*self.height
            c.setFillColor(BLUE); c.setStrokeColor(colors.white); c.setLineWidth(1.7); c.circle(xx,yy,10,fill=1,stroke=1)
            c.setFillColor(colors.white); c.setFont('Arial-Bold',9); c.drawCentredString(xx,yy-3,str(n))

def table(rows):
    data=[[p(x,'head' if i==0 else 'cell') for x in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=[CW*.27,CW*.73],hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('ROWBACKGROUNDS',(0,1),(-1,-1),[LIGHT,colors.white]),('LINEBELOW',(0,1),(-1,-1),.4,colors.HexColor('#DAE3EC'))]))
    return t

def md_blocks(text):
    lines=text.strip().splitlines(); out=[]; i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s: i+=1; continue
        if s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x) for x in row): rows.append(row)
                i+=1
            out.extend([table(rows),Spacer(1,11)]); continue
        if s.startswith('### '): out.append(p(s[4:],'sub')); i+=1; continue
        if s.startswith('## '): out.append(p(s[3:],'sub')); i+=1; continue
        m=re.match(r'^(\d+)\. (.*)',s)
        if m:
            st=ParagraphStyle('step',parent=S['body'],leftIndent=22,firstLineIndent=-22,spaceAfter=7)
            out.append(Paragraph('<font color="#008879"><b>'+m[1]+'.</b></font>  '+markup(m[2]),st)); i+=1; continue
        if s.startswith('- '):
            out.append(Paragraph('<font color="#008879">●</font>  '+markup(s[2:]),S['body'])); i+=1; continue
        out.append(p(s)); i+=1
    return out

class Doc(SimpleDocTemplate):
    def afterFlowable(self,f):
        if isinstance(f,Paragraph) and f.style.name=='h':
            title=f.getPlainText(); key='chapter-'+str(self.page)
            self.canv.bookmarkPage(key); self.canv.addOutlineEntry(title,key,level=0,closed=False)

def furniture(c,d,t):
    c.saveState()
    if d.page==1:
        c.setFillColor(NAVY); c.rect(0,0,W,H,fill=1,stroke=0)
        c.setFillColor(BLUE); c.rect(0,H-18,W,18,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#203F5A'))
        for x,y,w,h in [(330,97,70,76),(409,97,60,123),(478,97,72,172)]: c.roundRect(x,y,w,h,5,fill=1,stroke=0)
        c.setFillColor(TEAL); c.rect(44,102,178,5,fill=1,stroke=0)
    else:
        c.setFillColor(TEAL); c.rect(44,H-31,24,4,fill=1,stroke=0)
        c.setFillColor(MUTED); c.setFont('Arial-Bold',7); c.drawString(77,H-33,t['foot'])
        c.setFont('Arial',7); c.drawRightString(W-44,H-33,t['lang'])
        c.setStrokeColor(colors.HexColor('#DAE3EC')); c.line(44,38,W-44,38)
        c.setFont('Arial',7); c.drawString(44,25,'ZAVODLAR  /  29.10.2026'); c.drawRightString(W-44,25,f'{d.page:02d}')
    c.restoreState()

def build(lang):
    t=TEXT[lang]; raw=(ROOT/'docs'/t['file']).read_text(encoding='utf-8')
    matches=list(re.finditer(r'^## (\d+)\. (.+)$',raw,re.M)); sec={}
    for i,m in enumerate(matches): sec[int(m[1])]=(m[2],raw[m.end():matches[i+1].start() if i+1<len(matches) else len(raw)])
    story=[Spacer(1,55),p(t['lang'],'small'),Spacer(1,24)]
    story.append(Paragraph(t['title'].replace('\n','<br/>'),S['white']))
    story.extend([Spacer(1,24),Paragraph(markup(t['subtitle']),ParagraphStyle('coverSub',fontName='Arial-Bold',fontSize=17,leading=23,textColor=colors.HexColor('#A9D8FA'))),Spacer(1,15),Paragraph(markup(t['intro']),ParagraphStyle('coverIntro',fontName='Arial',fontSize=12,leading=18,textColor=colors.white)),Spacer(1,42),Shot(ROOT/'design-review/after/02-daily-desktop.png',CW*.79),Spacer(1,18),Paragraph('29.10.2026   /   PDF',ParagraphStyle('edition',fontName='Arial',fontSize=9,textColor=colors.HexColor('#B7CADB'))),PageBreak()])
    story.extend([p(t['contents'],'h'),Workflow(t['flow']),Spacer(1,12)])
    section_pages={1:3,2:3,3:4,4:5,5:5,6:6,7:7,8:9,9:9,10:10,11:11,12:11,13:12,14:12,15:13}
    toc=[]
    for n,(a,b) in sec.items():
        link=f'<link href="#chapter-{section_pages[n]}" color="#25384C">{n:02d}  {markup(a)}</link>'
        toc.append([Paragraph(link,S['body']),p(str(section_pages[n]))])
    toc_table=Table(toc,colWidths=[CW-30,30]); toc_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.3,colors.HexColor('#DAE3EC')),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    story.append(toc_table)
    story.extend([Spacer(1,15),p(t['note'],'small'),PageBreak()])

    groups=[([1,2],t['screens']),([3],t['roles']),([4,5],t['ready']),([6],t['orders']),([7],t['prod']),([],t['daily']),([8,9],t['ship']),([10],t['reports']),([11,12],t['mobile']),([13,14],t['admin']),([15],t['finish'])]
    for gi,(nums,title) in enumerate(groups):
        story.append(p(title,'h'))
        for n in nums:
            story.append(p(f'{n:02d} / '+sec[n][0],'sub')); story.extend(md_blocks(sec[n][1]))
        if nums==[1,2]:
            story.extend([Spacer(1,8),Shot(ROOT/'design-review/after/01-overview.png',CW*.84),Spacer(1,6),p(t['overview'],'small')])
        if nums==[6]:
            story.extend([Spacer(1,16),Workflow(t['flow'])])
        if nums==[7]:
            box=Table([[p(t['sample'],'sub')],[p(t['calc'])],[p(t['calcnote'])]],colWidths=[CW])
            box.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),LIGHT),('LEFTPADDING',(0,0),(-1,-1),14),('RIGHTPADDING',(0,0),(-1,-1),14)])); story.append(box)
        if not nums:
            story.extend([Shot(ROOT/'design-review/after/02-daily-desktop.png',CW,[(1,.16,.1),(2,.47,.26),(3,.93,.34),(4,.56,.64)]),Spacer(1,14)])
            for x in t['legend']: story.append(p(x))
            story.extend([Spacer(1,8),p(t['note'],'small')])
        if nums==[11,12]:
            a=Shot(ROOT/'design-review/after/03-daily-mobile.png',125); b=Shot(ROOT/'design-review/notifications/unread.png',183)
            shots=Table([[a,b]],colWidths=[CW/2,CW/2]); shots.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER')])); story.extend([Spacer(1,8),shots])
        if nums==[15]:
            story.extend([Spacer(1,26),Workflow(t['flow']),Spacer(1,22)])
            for i,x in enumerate(t['tips'],1): story.append(p(f'0{i}  /  {x}','sub'))
            story.append(Spacer(1,12)); story.append(p(t['note'],'small'))
        if gi<len(groups)-1: story.append(PageBreak())
    target=OUT/t['out']
    doc=Doc(str(target),pagesize=(W,H),rightMargin=44,leftMargin=44,topMargin=58,bottomMargin=54,title=t['subtitle'],author='Zavodlar ish stoli',pageCompression=1)
    doc.build(story,onFirstPage=lambda c,d:furniture(c,d,t),onLaterPages=lambda c,d:furniture(c,d,t))
    reader=PdfReader(target); texts=[p.extract_text() for p in reader.pages]
    for num,(heading,_) in sec.items():
        assert clean(heading) in '\n'.join(texts), (lang,num,heading)
    assert all('\ufffd' not in s for s in texts)
    pdf=pdfium.PdfDocument(str(target)); thumbs=[]
    for i,page in enumerate(pdf):
        image=page.render(scale=1.1).to_pil().convert('RGB'); image.save(TMP/f'{lang}-{i+1:02d}.png')
        thumb=ImageOps.contain(image,(238,337)); card=PILImage.new('RGB',(258,365),'#dce5ef'); card.paste(thumb,((258-thumb.width)//2,8)); ImageDraw.Draw(card).text((12,346),f'{lang.upper()}  /  {i+1}',fill='#13283e'); thumbs.append(card)
    cols=4; sheet=PILImage.new('RGB',(258*cols,365*((len(thumbs)+cols-1)//cols)),'white')
    for i,im in enumerate(thumbs): sheet.paste(im,((i%cols)*258,(i//cols)*365))
    sheet.save(TMP/f'{lang}-contact.png')
    return dict(language=lang,path=str(target),pages=len(reader.pages),bytes=target.stat().st_size,page_text_lengths=[len(s) for s in texts])

if __name__=='__main__':
    results=[build(lang) for lang in TEXT]
    (TMP/'validation.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(results,ensure_ascii=False,indent=2))
