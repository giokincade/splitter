I want to create a simple web app that allows you to take a WAV or MP3 file of a musical rehearsal, and then automatically split it into many wav/mp3 files, one for each song.
- All of hte processing should happen client side to avoid having to even have a server side or incur server side costs.
- Use typescript, React, Astro, and shadcn. Use the most modern and standard tools where possible.

# Initial screen
The first screen should just ask you to select a file.

# Mail file screen
Once a file has been selected, we'll need to process the file and decide where the volume levels have changed significantly enough to warrant a split.

After we've processed the file, we should display the waveform along with audio controls, and denote the splits with clear annotations.
- The controls should allow you to very quickly select splits and play them.
- The UX should allow you to move the split location backwards or forwards, or add/remove splits.
- Each split should have a name, which we can default to "Song 1", etc. And  you should be able to quickly edit it.

# Download

Once the user is satisfied with their split configuration, they should be able to hit download and get a zip file with each split as a separate WAV/mp3.
