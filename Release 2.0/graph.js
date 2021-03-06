function Graph(pictureFile) {
	var pictures = null;
	var graph = document.createElement("canvas");
	var ctx = null;
	var margin = 12;
	var dotRad = 3;
	var exRad = 3;
	var ranges = {
		time: [Number.MAX_VALUE, 0], 
		aT: [Number.MAX_VALUE, 0],
		aL: [Number.MAX_VALUE, 0],
		aH: [Number.MAX_VALUE, 0]
	};
	var shownImage = null;
	var selection = null;
	var imageBox = [0, 0, 0, 0];
	var fwdBox = [0, 0, 0, 0];
	var backBox = [0, 0, 0, 0];
	// iOS interface globals
	var tapState = false;
	var lastTouches = [];
	// time mark globals
	var tickLens = [
		60 * 60 * 24, // day
		60 * 60 * 12, // half day
		60 * 60 * 6, // quarter day
		60 * 60, // hour
		60 * 15, // 15 mins
		60, // minute
	];
	var localOffset = -60 * 60 * 4; // GMT-4
	function fetch() {
		var request = new XMLHttpRequest();
		request.onreadystatechange = function () {
			if(request.readyState == 4) {
				pictures = JSON.parse(request.responseText);
				init();
			}
		}
		request.open("GET", pictureFile, true);
		request.send();
	}
	function init() {
		// determine the bounds of the graph
		for(var i = 0; i < pictures.length; i++) {
			var pic = pictures[i];
			for(var name in ranges) {
				// don't move our viewport if we've started drawing already
				if(name == "time" && ctx != null)
					continue;
				if(pic[name] < ranges[name][0])
					ranges[name][0] = pic[name];
				if(pic[name] > ranges[name][1])
					ranges[name][1] = pic[name];
			}
		}
		console.log("total pictures: " + pictures.length);
		console.log("min/max Temp: " + ranges.aT + 
				" Humidity: " + ranges.aH +
				" Light: " + ranges.aL +
				" Time: " + ranges.time);
		// if we haven't set up the canvas yet
		if(ctx == null) {
			if(graph.getContext) {
				ctx = graph.getContext("2d");
				ctx.fillStyle = "#000000";
				graph.addEventListener("mousedown", startDrag);
				graph.addEventListener("mousemove", hoverHandle);
				graph.addEventListener("mousewheel", wheel);
				// iOS event handlers
				graph.addEventListener("touchstart", touchStart);
				graph.addEventListener("touchmove", touchMove);
				graph.addEventListener("touchend", touchEnd);
				graph.addEventListener("touchcancel", touchCancel);
			}else{
				console.log("Could not get 2D rendering context");
				return;
			}
			// adjust the time range to start showing the current day
			var dayLen = 60 * 60 * 24;
			ranges.time[1] += dayLen - ((ranges.time[1] + localOffset) % dayLen);
			ranges.time[0] = ranges.time[1] - dayLen;
			// call the init event handler
			graph.oninit();
		}else if(shownImage) {
			// the shown image metadata will no longer be valid for equality
			// we need to find it in the new picture manifest
			for(var i = 0; i < pictures.length; i++) {
				if(pictures[i].name == shownImage.meta.name) {
					shownImage.meta = pictures[i];
					break;
				}
			}
		}
		// draw the graph
		drawAll();
	}
	function saveTouches(touchList) {
		lastTouches = [];
		for(var i = 0; i < event.touches.length; i++)
			lastTouches[i] = {x: event.touches[i].pageX, y: event.touches[i].pageY};
	}
	function touchStart(event) {
		event.preventDefault();
		tapState = lastTouches.length == 0;
		saveTouches();
	}
	function touchMove(event) {
		event.preventDefault(); // prevents iOS drag scrolling
		tapState = false;
		if(event.touches.length == 1) {
			// we have one touch: do a drag
			var diff = event.touches[0].pageX - lastTouches[0].x;
			var ofs = -deltaXToDeltaTime(diff);
			// we adjust the time ranges that the graph is drawn between to affect scrolling
			ranges.time[0] += ofs;
			ranges.time[1] += ofs;
		}else if(event.touches.length == 2 && lastTouches.length == 2) {
			// we have two touches: drag-scale (ALGEBRA TO THE RESCUE)
			var A = XToTime(lastTouches[0].x);
			var A2 = XToTime(event.touches[0].pageX);
			var B = XToTime(lastTouches[1].x);
			var B2 = XToTime(event.touches[1].pageX);
			var scale = (B2 - A2) / (B - A);
			var offset = A2 - A * scale;
			ranges.time[0] = (ranges.time[0] - offset) / scale;
			ranges.time[1] = (ranges.time[1] - offset) / scale;
			if(ranges.time[0] > ranges.time[1]) {
				// if we've gotten a negative scale, swap the ranges
				var temp = ranges.time[0];
				ranges.time[0] = ranges.time[1];
				ranges.time[1] = temp;
			}
		}
		saveTouches();
		drawAll();
	}
	function touchEnd(event) {
		if(lastTouches.length == 1 && tapState) {
			// the last touch was a tap
			if(overFwd(lastTouches[0].x, lastTouches[0].y)) {
				var curIndex = pictures.indexOf(shownImage.meta);
				showPic(pictures[curIndex + 1]);
			}else if(overBack(lastTouches[0].x, lastTouches[0].y)) {
				var curIndex = pictures.indexOf(shownImage.meta);
				showPic(pictures[curIndex - 1]);
			}else if(overImage(lastTouches[0].x, lastTouches[0].y)) {
				shownImage = null;
				drawAll();
			}else{
				var newSelection = dataPointAt(lastTouches[0].x, lastTouches[0].y, dotRad + exRad + 10);
				if(newSelection && selection && newSelection.pic == selection.pic) {
					showPic(selection.pic);
				}else if(newSelection != selection) {
					selection = newSelection;
					drawAll();
				}
			}
		}
		saveTouches();
	}
	function touchCancel(event) {
		// this is a funny special-case-y event that is fired when a touch is ended
		// for a reason other than a finger leaving the screen
		saveTouches();
	}
	function wheel(event) {
		event.preventDefault();
		var center = XToTime(event.offsetX);
		if(event.wheelDelta < 0) {
			// zoom out
			ranges.time[0] -= center - ranges.time[0];
			ranges.time[1] += ranges.time[1] - center;
		}else{
			// zoom in
			ranges.time[0] += (center - ranges.time[0]) / 2;
			ranges.time[1] -= (ranges.time[1] - center) / 2;
		}
		drawAll();
	}
	function drawAll() {
		setupGraph(); // draws the borders and gridlines
		drawLines(); // draws the data elements
		drawSelectBox(); // draws the hovertext box
		drawTimeMarker(new Date().getTime() / 1000, "#00FF00"); // draw a marker for the current time
		drawImageOverlay(); // draws the box showing a selected image
	}
	function drawTimeMarker(time, color) {
		var MarkX = timeToX(time);
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(MarkX, 0);
		ctx.lineTo(MarkX, graph.height);
		ctx.stroke();
		ctx.closePath();
		// bottom triangle
		ctx.beginPath();
		ctx.moveTo(MarkX, graph.height - margin);
		ctx.lineTo(MarkX + 10, graph.height);
		ctx.lineTo(MarkX - 10, graph.height);
		ctx.closePath();
		ctx.fill();
		// top triangle
		ctx.beginPath();
		ctx.moveTo(MarkX, margin);
		ctx.lineTo(MarkX + 10, 0);
		ctx.lineTo(MarkX - 10, 0);
		ctx.closePath();
		ctx.fill();
	}
	function drawImageOverlay() {
		if(shownImage) {
			// draw an indicator on the graph showing the time of the current picture
			drawTimeMarker(shownImage.meta.time, "#FF8800");
			// shows the image centered in the viewport
			// and scaled down if neccessary to fit
			var scale = 1;
			if(shownImage.width > graph.width - margin * 2) {
				var xScale = (graph.width - margin * 2) / shownImage.width;
				if(xScale < scale)
					scale = xScale;
			}
			if(shownImage.height > graph.height - margin * 2) {
				var yScale = (graph.height - margin * 2) / shownImage.height;
				if(yScale < scale)
					scale = yScale;
			}
			var x = graph.width / 2 - (shownImage.width * scale) / 2;
			var y = graph.height / 2 - (shownImage.height * scale) / 2;
			imageBox = [x, y, x + shownImage.width * scale, y + shownImage.height * scale];
			// draw the image
			ctx.save()
			ctx.translate(x, y);
			ctx.scale(scale, scale);
			ctx.drawImage(shownImage, 0, 0);
			ctx.restore();
			// draw the image url
			ctx.font = "10px sans-serif";
			var tm = ctx.measureText(shownImage.src);
			var tx = x - tm.width / 2 + shownImage.width * scale / 2;
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(tx, y + 1, tm.width + 2, -12);
			ctx.fillStyle = "#FFFFFF";
			ctx.fillText(shownImage.src, tx, y - 2);
			// draw the close button
			var bx = x + shownImage.width * scale;
			ctx.fillStyle = "#FFFFFF";
			ctx.beginPath();
			ctx.arc(bx, y, margin, 0, Math.PI * 2);
			ctx.fill();
			ctx.closePath();
			ctx.fillStyle = "#880000";
			ctx.beginPath();
			ctx.arc(bx, y, margin - 1, 0, Math.PI * 2);
			ctx.fill();
			ctx.closePath();
			ctx.strokeStyle = "#FFFFFF";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(bx - (margin / 2), y + (margin / 2));
			ctx.lineTo(bx + (margin / 2), y - (margin / 2));
			ctx.stroke();
			ctx.closePath();
			ctx.beginPath();
			ctx.moveTo(bx + (margin / 2), y + (margin / 2));
			ctx.lineTo(bx - (margin / 2), y - (margin / 2));
			ctx.stroke();
			ctx.closePath();
			// Draw forward and back buttons
			ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
			var curIndex = pictures.indexOf(shownImage.meta);
			if(curIndex > 0) {
				// back button
				backBox = [
					Math.max(imageBox[0] - 60, margin + 10),
					graph.height * 0.25, 
					Math.max(imageBox[0] - 60, margin + 10) + 40, 
					graph.height * 0.75
				];
				ctx.beginPath();
				ctx.moveTo(backBox[0], graph.height * 0.5);
				ctx.lineTo(backBox[2], backBox[1]);
				ctx.lineTo(backBox[2], backBox[3]);
				ctx.closePath();
				ctx.fill();
			}
			if(curIndex + 1 < pictures.length) {
				// forward button
				fwdBox = [
					Math.min(graph.width - (margin + 10), imageBox[2] + 60) - 40, 
					graph.height * 0.25, 
					Math.min(graph.width - (margin + 10), imageBox[2] + 60), 
					graph.height * 0.75
				];
				ctx.beginPath();
				ctx.moveTo(fwdBox[2], graph.height * 0.5);
				ctx.lineTo(fwdBox[0], fwdBox[1]);
				ctx.lineTo(fwdBox[0], fwdBox[3]);
				ctx.closePath();
				ctx.fill();
			}
		}
	}
	function testBox(x, y, box) { // box format: [xm, ym, xM, yM]
		return	x > box[0] &&
			x < box[2] &&
			y > box[1] &&
			y < box[3];
	}
	function testCircle(x, y, pos, rad) {
		return	(x - pos[0]) * (x - pos[0]) +
			(y - pos[1]) * (y - pos[1]) < rad * rad;
	}
	function overFwd(x, y) {
		return	shownImage &&
			pictures.indexOf(shownImage.meta) + 1 < pictures.length && 
			testBox(x, y, fwdBox);
			
	}
	function overBack(x, y) {
		return	shownImage && 
			pictures.indexOf(shownImage.meta) > 0 && 
			testBox(x, y, backBox);
	}
	function overImage(x, y) {
		return shownImage && (testBox(x, y, imageBox) || testCircle(x, y, [imageBox[2], imageBox[1]], margin));
	}
	function drawLines() {
		graphLine("aH", "#00FFFF"); // Humidity, Cyan
		graphLine("aL", "#FFFF00"); // Light, Yellow
		graphLine("aT", "#FF0000"); // Temp, Red
	}
	function drawSelectBox() {
		// selection text
		if(selection) {
			ctx.font = "12px sans-serif";
			var dateString = new Date(selection.pic.time * 1000).toString().split(' ').slice(0, 5).join(' ');
			var textWidth = ctx.measureText(dateString).width;
			var x = timeToX(selection.pic.time) - textWidth / 2;
			var y = dataToY(selection.pic, selection.line);
			if(y > graph.height / 2)
				y -= 24;
			else
				y += 24;
			ctx.fillStyle = "#FFFFFF";
			ctx.fillRect(x - 3, y - 13, textWidth + 6, 30);
			ctx.fillStyle = "#000000";
			ctx.fillRect(x - 2, y - 12, textWidth + 4, 28);
			var dataNames = {
				aL: ["Light", ""],
				aH: ["Humidity", "%"],
				aT: ["Temperature", "\u00B0F"]
			}
			ctx.fillStyle = "#FFFFFF";
			ctx.fillText(dateString, x, y);
			ctx.fillText(
				dataNames[selection.line][0] + ": " +
				selection.pic[selection.line] +
				dataNames[selection.line][1],
			x, y + 12);
		}
	}
	function setupGraph() {
		// clear the canvas
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, graph.width, graph.height);

		ctx.lineWidth = 2;

		ctx.strokeStyle = "#FFFFFF";

		// vertical axis
		ctx.beginPath();
		ctx.moveTo(margin, graph.height - margin);
		ctx.lineTo(margin, margin);
		ctx.stroke();
		ctx.closePath();

		// horizontal axis
		ctx.beginPath();	
		ctx.moveTo(margin, graph.height - margin);
		ctx.lineTo(graph.width - margin, graph.height - margin);
		ctx.stroke();
		ctx.closePath();

		// time markings
		// day ticks
		if(deltaTimeToDeltaX(tickLens[0]) > 50)
			drawTicks(tickLens[0], [1, 3], 0);
		// half day, quarter day, hour, 15 min, and 1 min ticks
		for(var i = 1; deltaTimeToDeltaX(tickLens[i]) > 50 && i < tickLens.length; i++) {
			drawTicks(tickLens[i], [4, 5], tickLens[i - 1]);
		}
	}
	function drawTicks(tickLen, dateSlice, skip) {
		var markTime = ranges.time[0] - (ranges.time[0] % tickLen) - localOffset;
		while(markTime >= ranges.time[0])
			markTime -= tickLen;
		markTime += tickLen;
		for(; markTime < ranges.time[1]; markTime += tickLen) {
			if((markTime + localOffset) % skip == 0)
				continue;
			var markX = timeToX(markTime);
			ctx.strokeStyle = "#FFFFFF";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(markX, graph.height - margin);
			ctx.lineTo(markX, graph.height);
			ctx.stroke();
			ctx.closePath();
			ctx.strokeStyle = "#888888";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(markX, margin);
			ctx.lineTo(markX, graph.height - margin);
			ctx.stroke();
			ctx.closePath();
			ctx.fillStyle = "#FFFFFF";
			ctx.font = "10px sans-serif";
			var label = new Date(markTime * 1000).toString()
				.split(' ').slice(dateSlice[0], dateSlice[1]).join(' ');
			ctx.fillText(label, markX + 2, graph.height - 2);
		}
	}
	function graphLine(name, color) {
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.beginPath()
		var lastTime = 0;
		for(var i = 0; i < pictures.length; i++) {
			var pic = pictures[i];
			// cull out-of-range data points
			if(
				pic.time < ranges.time[0] && !(i + 1 < pictures.length && pictures[i + 1].time > ranges.time[0]) ||
				pic.time > ranges.time[1] && !(i - 1 > 0 && pictures[i - 1].time < ranges.time[1])
			) {
				// but don't cull it if it is directly connected to an in-range point
				continue;
			}
			x = timeToX(pic.time);
			y = dataToY(pic, name);
			// we don't connect the line if the samples are more than an hour apart
			if(i == 0 || (pic.time - lastTime > 60 * 60))
				ctx.moveTo(x, y);
			else
				ctx.lineTo(x, y);
			lastTime = pic.time;
		}
		ctx.stroke();
		ctx.closePath();
		for(var i = 0; i < pictures.length; i++) {
			var pic = pictures[i];
			// cull out-of-range data points
			if(pic.time < ranges.time[0] || pic.time > ranges.time[1])
				continue;
			var expand = 0;
			if(selection && pic == selection.pic && name == selection.line)
				expand = exRad;
			x = timeToX(pic.time);
			y = dataToY(pic, name);
			ctx.fillStyle = "#000000";
			ctx.beginPath();
			ctx.arc(x, y, dotRad + expand, 0, Math.PI * 2);
			ctx.fill();
			ctx.closePath();
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, dotRad - 1 + expand, 0, Math.PI * 2);
			ctx.fill();
			ctx.closePath();
		}
	}
	function scale(value, inRange, outRange) {
		var frac = (value - inRange[0]) / (inRange[1] - inRange[0]);
		return frac * (outRange[1] - outRange[0]) + outRange[0];
	}
	function timeToX(time) {
		return scale(time, ranges.time, [margin, graph.width - margin]);
	}
	function dataToY(pic, attr) {
		return scale(pic[attr], ranges[attr], [graph.height - margin, margin]);
	}
	function XToTime(x) {
		return scale(x, [margin, graph.width - margin], ranges.time);
	}
	function deltaXToDeltaTime(diff) {
		return diff / (graph.width - margin * 2) * (ranges.time[1] - ranges.time[0]);
	}
	function deltaTimeToDeltaX(diff) {
		return diff * (graph.width - margin * 2) / (ranges.time[1] - ranges.time[0]);
	}
	function dataPointAt(x, y, radius) {
		for(var i = 0; i < pictures.length; i++) {
			var pic = pictures[i];
			if(Math.abs(timeToX(pic.time) - x) < radius) {
				for(var name in pic) {
					if(name == "time" || name == "name")
						continue;
					if(Math.abs(dataToY(pic, name) - y) < radius) {
						return {pic: pic, line: name};
					}
				}
			}
		}
		return null;
	}
	function showPic(pic) {
		// if the time of the picture is out of range, recenter the viewport around the picture
		if(pic.time < ranges.time[0] || pic.time > ranges.time[1]) {
			var timeRange = ranges.time[1] - ranges.time[0];
			ranges.time[0] = pic.time - (timeRange / 2);
			ranges.time[1] = pic.time + (timeRange / 2);
		}
		shownImage = new Image();
		shownImage.onload = function () { drawAll(); }
		shownImage.src = "eyefi/" + pic.name;
		shownImage.meta = pic;
	}
	function startDrag(event) {
		event.preventDefault(); // prevents browser from doing a selection
		if(overFwd(event.offsetX, event.offsetY)) {
			var curIndex = pictures.indexOf(shownImage.meta);
			showPic(pictures[curIndex + 1]);
			return;
		}
		if(overBack(event.offsetX, event.offsetY)) {
			var curIndex = pictures.indexOf(shownImage.meta);
			showPic(pictures[curIndex - 1]);
			return;
		}
		if(overImage(event.offsetX, event.offsetY)) {
			shownImage = null;
			drawAll();
			return;
		}
		if(selection) {
			showPic(selection.pic);
			return;
		}
		var lastPos = [event.clientX, event.clientY];
		function moveHandle(event) {
			var diff = event.clientX - lastPos[0];
			lastPos = [event.clientX, event.clientY];
			var ofs = -deltaXToDeltaTime(diff);
			// we adjust the time ranges that the graph is drawn between to affect scrolling
			ranges.time[0] += ofs;
			ranges.time[1] += ofs;
			drawAll();
		}
		function upHandle(event) {
			document.removeEventListener("mousemove", moveHandle, false);
			document.removeEventListener("mouseup", upHandle, false);
		}
		document.addEventListener("mousemove", moveHandle);
		document.addEventListener("mouseup", upHandle);
	}
	function hoverHandle(event) {
		var x = event.offsetX;
		var y = event.offsetY;
		if(overImage(x, y) || overFwd(x, y) || overBack(x, y)) {
			graph.style.cursor = "pointer";
			return;
		}else{
			graph.style.cursor = "move";
		}
		var newSelection = dataPointAt(event.offsetX, event.offsetY, dotRad + exRad);
		if(newSelection) {
			selection = newSelection;
			graph.style.cursor = "pointer";
			drawAll();
		}else if(selection) {
			selection = newSelection;
			graph.style.cursor = "move";
			drawAll();
		}
	}
	// start up the graph by fetching the data 
	fetch();
	// begin fetching graph data every 5 minutes
	setInterval(fetch, 1000 * 60 * 5);
	// we expose our functionality through methods on the html element
	graph.redraw = function (event) { drawAll(); }
	graph.fetch = function (event) { fetch(); }
	graph.oninit = function () {}
	return graph;
}
