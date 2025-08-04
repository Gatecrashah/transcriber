Please write your entire context into a .md file in /tmp with a unique file name.

After you are done, cat the file you created and pipe it to pbcopy and write a success message. The entire flow should look like this:

* write summary to /tmp/random-file-name.md
* cat /tmp/random-file-name.md | pbcopy
* write SUMMARY COPIED TO CLIPBOARD
