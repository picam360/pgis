SRC=$1
DST="$(dirname "$(realpath "$0")")"

ln -s $SRC/src/nvs_tools.cpp $DST/src/nvs_tools.cpp
ln -s $SRC/src/rtk.cpp $DST/src/rtk.cpp
ln -s $SRC/src/rover_settings.cpp $DST/src/rover_settings.cpp
ln -s $SRC/src/tools.cpp $DST/src/tools.cpp
ln -s $SRC/src/ubloxmsgreader.cpp $DST/src/ubloxmsgreader.cpp

ln -s $SRC/include/nmea_gga.h $DST/include/nmea_gga.h
ln -s $SRC/include/nvs_tools.h $DST/include/nvs_tools.h
ln -s $SRC/include/rtk.h $DST/include/rtk.h
ln -s $SRC/include/rover_settings.h $DST/include/rover_settings.h
ln -s $SRC/include/tools.h $DST/include/tools.h
ln -s $SRC/include/ubloxmsgreader.h $DST/include/ubloxmsgreader.h