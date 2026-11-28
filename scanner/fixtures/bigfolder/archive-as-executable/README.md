# Archive named as the launcher

Put `stored.zip` at `Contents/MacOS/Launch`. The previous native scan inherited the architectures of the app inside the ZIP. The declared file is an archive, so the outer app should report `invalid` with `executable_not_macho` and an empty architecture list.
