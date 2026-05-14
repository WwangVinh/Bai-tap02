// =====================================================================
// CẤU HÌNH BLYNK - Phải đặt TRÊN CÙNG trước mọi #include
// Blynk cần các macro này được định nghĩa trước khi nạp thư viện
// =====================================================================
#define BLYNK_TEMPLATE_ID "TMPL65tufqynp"   // ID template trên Blynk Cloud (định danh loại dự án)
#define BLYNK_TEMPLATE_NAME "4RELAY"         // Tên template cho dễ nhận biết
#define BLYNK_AUTH_TOKEN "Txs1xcOsg0BcNz07oy3rBawYlzI5ua6y" // Mã xác thực thiết bị - như "mật khẩu" để Blynk nhận ra ESP32 này

// =====================================================================
// NẠP THƯ VIỆN
// =====================================================================
#include <WiFi.h>               // Thư viện WiFi tích hợp sẵn của ESP32
#include <WiFiClient.h>         // Thư viện tạo kết nối TCP/IP qua WiFi (Blynk cần)
#include <BlynkSimpleEsp32.h>   // Thư viện Blynk dành riêng cho ESP32
#include <Adafruit_GFX.h>       // Thư viện đồ họa cơ bản (vẽ chữ, hình, màu sắc)
#include <Adafruit_ST7735.h>    // Thư viện điều khiển màn hình TFT IPS ST7735 qua SPI
#include <DHT.h>                // Thư viện đọc cảm biến nhiệt độ/độ ẩm DHT11/DHT22
#include <SPI.h>                // Thư viện giao tiếp SPI (màn hình TFT dùng giao thức này)

// =====================================================================
// THÔNG TIN KẾT NỐI WIFI
// =====================================================================
char auth[] = BLYNK_AUTH_TOKEN; // Sao chép token vào biến char[] để truyền vào hàm Blynk.begin()
char ssid[] = "P612";           // Tên mạng WiFi cần kết nối
char pass[] = "12348765";       // Mật khẩu WiFi

// =====================================================================
// CẤU HÌNH CHÂN (PIN) CHO CÁC LINH KIỆN
// #define là thay thế văn bản tại compile-time, không tốn RAM
// =====================================================================
#define DHT_PIN      22   // Chân GPIO 22 nối với chân DATA của cảm biến DHT11
#define DHT_TYPE     DHT11 // Chỉ định đúng loại cảm biến (DHT11 khác DHT22 về giao thức)

#define TFT_CS       5    // Chip Select: GPIO 5 - kéo LOW để chọn màn hình TFT trên bus SPI
#define TFT_RST      4    // Reset: GPIO 4 - kéo LOW để reset màn hình
#define TFT_DC       2    // Data/Command: GPIO 2 - LOW = gửi lệnh, HIGH = gửi dữ liệu ảnh

// Mảng lưu chân GPIO của 3 relay (dùng mảng để xử lý bằng vòng for cho gọn)
// relayPins[0]=25 -> Đèn | relayPins[1]=26 -> Bơm | relayPins[2]=32 -> Quạt
const int relayPins[] = {25, 26, 32};

// =====================================================================
// KHỞI TẠO ĐỐI TƯỢNG (Objects)
// =====================================================================
DHT dht(DHT_PIN, DHT_TYPE);                        // Tạo đối tượng DHT, truyền vào chân và loại cảm biến
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST); // Tạo đối tượng màn hình TFT với 3 chân điều khiển
BlynkTimer timer;                                   // Tạo bộ đếm giờ của Blynk (thay thế delay(), không chặn vòng lặp)

// =====================================================================
// NGƯỠNG TỰ ĐỘNG HÓA - Giá trị dùng để quyết định bật/tắt thiết bị
// =====================================================================
float temp_hot  = 32.0; // Nếu nhiệt độ VƯỢT QUA 32°C -> tự động BẬT quạt
float temp_cool = 28.0; // Nếu nhiệt độ XUỐNG DƯỚI 28°C -> tự động TẮT quạt
float humi_dry  = 40.0; // Nếu độ ẩm XUỐNG DƯỚI 40% -> tự động BẬT bơm
float humi_wet  = 60.0; // Nếu độ ẩm VƯỢT QUA 60%  -> tự động TẮT bơm

// Biến cờ (flag): lưu trạng thái hiện tại của thiết bị
// 0 = đang TẮT, 1 = đang BẬT - dùng để tránh ra lệnh thừa liên tục
int trangThaiBom  = 0; // Ban đầu bơm đang tắt
int trangThaiQuat = 0; // Ban đầu quạt đang tắt

// =====================================================================
// HÀM XỬ LÝ TÍN HIỆU TỪ APP BLYNK
// BLYNK_WRITE(Vx) tự động được gọi khi người dùng nhấn nút trên app
// param.asInt() đọc giá trị gửi về: 1 = bật, 0 = tắt
// =====================================================================

// Khi người dùng nhấn nút V1 trên app -> điều khiển Đèn (relay chân 25)
BLYNK_WRITE(V1) {
    // Relay kích mức LOW (LOW = BẬT, HIGH = TẮT - relay âm)
    // param.asInt()==1 thì ghi LOW (bật đèn), ==0 thì ghi HIGH (tắt đèn)
    digitalWrite(relayPins[0], param.asInt() ? LOW : HIGH);
}

// Khi người dùng nhấn nút V2 trên app -> điều khiển Bơm (relay chân 26)
BLYNK_WRITE(V2) {
    trangThaiBom = param.asInt();                           // Lưu trạng thái vào biến cờ để logic tự động biết
    digitalWrite(relayPins[1], trangThaiBom ? LOW : HIGH);  // Bật/tắt relay bơm
}

// Khi người dùng nhấn nút V3 trên app -> điều khiển Quạt (relay chân 32)
BLYNK_WRITE(V3) {
    trangThaiQuat = param.asInt();                           // Lưu trạng thái vào biến cờ
    digitalWrite(relayPins[2], trangThaiQuat ? LOW : HIGH);  // Bật/tắt relay quạt
}

// =====================================================================
// HÀM TỰ ĐỘNG HÓA CHÍNH - Được gọi mỗi 2 giây bởi BlynkTimer
// =====================================================================
void processAutomation() {
    float h = dht.readHumidity();    // Đọc độ ẩm từ DHT11, trả về số thực (ví dụ: 55.0)
    float t = dht.readTemperature(); // Đọc nhiệt độ từ DHT11 theo Celsius

    // isnan() = "is Not a Number" - kiểm tra cảm biến có đọc lỗi không
    // Nếu cảm biến lỗi/mất kết nối, hàm read trả về NaN -> bỏ qua xử lý
    if (!isnan(h) && !isnan(t)) {

        // Gửi giá trị nhiệt độ và độ ẩm lên Virtual Pin V4, V5 để hiển thị trên app
        Blynk.virtualWrite(V4, t); // Cập nhật widget nhiệt độ trên app
        Blynk.virtualWrite(V5, h); // Cập nhật widget độ ẩm trên app

        // ----- LOGIC 1: TỰ ĐỘNG BƠM theo độ ẩm -----
        if (h < humi_dry && trangThaiBom == 0) {
            // Điều kiện: độ ẩm THẤP HƠN 40% VÀ bơm đang TẮT
            // -> Bật bơm để tưới/tăng độ ẩm
            digitalWrite(relayPins[1], LOW);  // Kéo relay xuống LOW = BẬT bơm
            trangThaiBom = 1;                 // Cập nhật cờ: bơm đang BẬT
            Blynk.virtualWrite(V2, 1);        // Đồng bộ nút V2 trên app thành trạng thái ON
        } 
        else if (h > humi_wet && trangThaiBom == 1) {
            // Điều kiện: độ ẩm CAO HƠN 60% VÀ bơm đang BẬT
            // -> Tắt bơm, độ ẩm đã đủ rồi
            digitalWrite(relayPins[1], HIGH); // Kéo relay lên HIGH = TẮT bơm
            trangThaiBom = 0;                 // Cập nhật cờ: bơm đang TẮT
            Blynk.virtualWrite(V2, 0);        // Đồng bộ nút V2 trên app thành trạng thái OFF
        }

        // ----- LOGIC 2: TỰ ĐỘNG QUẠT theo nhiệt độ -----
        if (t > temp_hot && trangThaiQuat == 0) {
            // Điều kiện: nhiệt độ CAO HƠN 32°C VÀ quạt đang TẮT
            // -> Bật quạt làm mát
            digitalWrite(relayPins[2], LOW);  // BẬT quạt
            trangThaiQuat = 1;                // Cập nhật cờ
            Blynk.virtualWrite(V3, 1);        // Đồng bộ nút V3 trên app thành ON
        } 
        else if (t < temp_cool && trangThaiQuat == 1) {
            // Điều kiện: nhiệt độ XUỐNG DƯỚI 28°C VÀ quạt đang BẬT
            // -> Tắt quạt, nhiệt độ đã mát rồi
            digitalWrite(relayPins[2], HIGH); // TẮT quạt
            trangThaiQuat = 0;                // Cập nhật cờ
            Blynk.virtualWrite(V3, 0);        // Đồng bộ nút V3 trên app thành OFF
        }

        // ----- HIỂN THỊ LÊN MÀN HÌNH TFT -----
        // Xóa vùng hiển thị cũ bằng cách tô đè màu đen (tránh chữ bị chồng nhau)
        // fillRect(x, y, width, height, color)
        tft.fillRect(10, 20, 140, 50, ST77XX_BLACK);

        tft.setCursor(10, 25);              // Di chuyển con trỏ đến tọa độ (x=10, y=25)
        tft.setTextColor(ST77XX_YELLOW);    // Đặt màu chữ vàng cho nhiệt độ
        tft.setTextSize(2);                 // Cỡ chữ 2 (mỗi ký tự ~12x16 pixel)
        tft.printf("T: %.1f C", t);         // In nhiệt độ, %.1f = 1 chữ số thập phân

        tft.setCursor(10, 50);              // Di chuyển con trỏ xuống dòng dưới
        tft.setTextColor(ST77XX_CYAN);      // Đặt màu chữ xanh cyan cho độ ẩm
        tft.setTextSize(2);
        tft.printf("H: %.0f %%", h);        // In độ ẩm, %.0f = không có thập phân, %% = in ký tự %
    }
    // Nếu isnan -> không làm gì, chờ lần đọc tiếp theo sau 2 giây
}

// =====================================================================
// HÀM SETUP - Chạy MỘT LẦN DUY NHẤT khi ESP32 khởi động
// =====================================================================
void setup() {
    Serial.begin(115200); // Khởi động cổng Serial với tốc độ 115200 baud để debug qua máy tính

    // Cấu hình 3 chân relay bằng vòng for - gọn hơn viết 3 lần riêng lẻ
    for(int i = 0; i < 3; i++) {
        pinMode(relayPins[i], OUTPUT);      // Đặt chân GPIO thành ngõ ra (OUTPUT)
        digitalWrite(relayPins[i], HIGH);   // Ghi HIGH = TẮT relay ngay từ đầu (tránh bật nhầm khi reset)
    }

    dht.begin();               // Khởi động cảm biến DHT11 (cấu hình giao tiếp 1-wire)
    tft.initR(INITR_MINI160x80); // Khởi động màn hình TFT với độ phân giải 160x80 (loại mini)
    tft.setRotation(1);          // Xoay màn hình 90° theo chiều ngang (landscape)
    tft.invertDisplay(true);     // Đảo màu hiển thị (do loại màn hình này cần đảo để màu đúng)
    tft.fillScreen(ST77XX_BLACK); // Xóa toàn bộ màn hình bằng màu đen

    // Kết nối Blynk: truyền auth token, tên WiFi, mật khẩu
    // Hàm này sẽ chặn (blocking) cho đến khi kết nối WiFi + Blynk thành công
    Blynk.begin(auth, ssid, pass);

    // Đăng ký hàm processAutomation chạy định kỳ mỗi 2000ms = 2 giây
    // 2000L: L = kiểu long, cần thiết vì BlynkTimer nhận tham số long
    timer.setInterval(2000L, processAutomation);
}

// =====================================================================
// VÒNG LẶP CHÍNH - Chạy LIÊN TỤC sau khi setup() hoàn tất
// KHÔNG được dùng delay() ở đây vì sẽ chặn Blynk.run() và timer.run()
// =====================================================================
void loop() {
    Blynk.run(); // Xử lý kết nối Blynk: nhận lệnh từ app, giữ kết nối, gửi dữ liệu
    timer.run(); // Kiểm tra và kích hoạt các hàm timer đã đăng ký (processAutomation mỗi 2s)
}


ESP32 khởi động
    └── setup(): cấu hình relay, màn hình, DHT, kết nối WiFi+Blynk
            │
            └── loop() chạy vô hạn:
                    ├── Blynk.run() ──► Nhận lệnh từ app (V1/V2/V3) ──► BLYNK_WRITE() ──► bật/tắt relay ngay
                    │
                    └── timer.run() ──► Mỗi 2 giây ──► processAutomation()
                                                              ├── Đọc DHT11 (nhiệt độ, độ ẩm)
                                                              ├── Gửi số liệu lên app (V4, V5)
                                                              ├── Tự động bật/tắt Bơm theo độ ẩm
                                                              ├── Tự động bật/tắt Quạt theo nhiệt độ
                                                              └── Hiển thị lên màn hình TFT
