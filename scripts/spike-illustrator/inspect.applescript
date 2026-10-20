-- Runs inspect.jsx in Adobe Illustrator on a folder of spike PDFs.
-- Usage: osascript scripts/spike-illustrator/inspect.applescript <absolute folder>
on run argv
	set here to do shell script "dirname " & quoted form of POSIX path of (path to me)
	set jsx to POSIX file (here & "/inspect.jsx")
	with timeout of 900 seconds
		tell application id "com.adobe.illustrator"
			activate
			return do javascript jsx with arguments {item 1 of argv}
		end tell
	end timeout
end run
