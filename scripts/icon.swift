import AppKit
let size = 1024.0
let image = NSImage(size: NSSize(width:size,height:size))
image.lockFocus()
NSColor(calibratedRed:0.94,green:0.92,blue:0.86,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:38,y:38,width:948,height:948),xRadius:218,yRadius:218).fill()
NSColor(calibratedRed:0.14,green:0.15,blue:0.13,alpha:1).setStroke()
let feather = NSBezierPath()
feather.lineWidth = 38
feather.lineJoinStyle = .round
feather.lineCapStyle = .round
feather.move(to: NSPoint(x:282,y:260))
feather.line(to: NSPoint(x:672,y:650))
feather.move(to: NSPoint(x:360,y:338))
feather.line(to: NSPoint(x:365,y:510))
feather.curve(to: NSPoint(x:744,y:766),controlPoint1:NSPoint(x:366,y:688),controlPoint2:NSPoint(x:592,y:790))
feather.curve(to: NSPoint(x:551,y:365),controlPoint1:NSPoint(x:783,y:590),controlPoint2:NSPoint(x:698,y:365))
feather.close()
feather.stroke()
let notch = NSBezierPath()
notch.lineWidth = 32
notch.lineCapStyle = .round
notch.move(to:NSPoint(x:505,y:482))
notch.line(to:NSPoint(x:649,y:482))
notch.stroke()
image.unlockFocus()
let bitmap=NSBitmapImageRep(data:image.tiffRepresentation!)!
try! bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
