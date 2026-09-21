const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

// إن وُجد CLOUDINARY_URL نرفع إلى Cloudinary، وإلا نحفظ محليًا في public/uploads
const useCloudinary = !!process.env.CLOUDINARY_URL;
let cloudinary = null;
if (useCloudinary) {
  cloudinary = require('cloudinary').v2; // يقرأ CLOUDINARY_URL تلقائيًا
  cloudinary.config({ secure: true });
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(new Error('نوع الملف غير مدعوم (JPG / PNG / WEBP فقط)'));
  },
});

/** يحفظ الصورة ويرجع الرابط الذي سيُخزَّن في قاعدة البيانات */
async function saveImage(file) {
  if (useCloudinary) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'hujjat-batool',
          resource_type: 'image',
          transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      stream.end(file.buffer);
    });
  }
  const dir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + EXT[file.mimetype];
  await fs.promises.writeFile(path.join(dir, name), file.buffer);
  return `/uploads/${name}`;
}

module.exports = { upload, saveImage, useCloudinary };
